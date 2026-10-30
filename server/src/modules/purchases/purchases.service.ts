import { prisma, Prisma } from "../../services/prisma";
import { NotFoundError } from "../../utils/errors";
import { emitEvent } from "../../socket";
import { cacheDelNamespace } from "../../utils/cache";
import type { CreateStockInput } from "./purchases.schema";

export const purchasesService = {
  async list({
    page = 1,
    limit = 100000,
    search,
    dateFrom,
    dateTo,
    archived = false,
    sortBy,
    sortOrder,
  }: {
    page?: number;
    limit?: number;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    archived?: boolean;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  } = {}) {
    const where: Prisma.StockPurchaseWhereInput = {
      active: archived ? 0 : 1,
    };

    if (search) {
      const q = search.trim();
      where.OR = [
        { invoiceNumber: { contains: q, mode: "insensitive" } },
        { batchNumber: { contains: q, mode: "insensitive" } },
        { product: { name: { contains: q, mode: "insensitive" } } },
        { distributor: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(`${dateFrom}T00:00:00.000Z`);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(`${dateTo}T23:59:59.999Z`);
      }
    }

    const skip = (page - 1) * limit;

    let orderBy: Prisma.StockPurchaseOrderByWithRelationInput = { createdAt: sortOrder || "desc" };
    if (sortBy === "productName" || sortBy === "name") {
      orderBy = { product: { name: sortOrder || "asc" } };
    } else if (sortBy === "invoiceNumber") {
      orderBy = { invoiceNumber: sortOrder || "desc" };
    } else if (sortBy === "batchNumber") {
      orderBy = { batchNumber: sortOrder || "asc" };
    } else if (sortBy === "quantity") {
      orderBy = { quantity: sortOrder || "desc" };
    } else if (sortBy === "createdAt" || sortBy === "created_at") {
      orderBy = { createdAt: sortOrder || "desc" };
    }

    const [total, data] = await prisma.$transaction([
      prisma.stockPurchase.count({ where }),
      prisma.stockPurchase.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          product: { select: { name: true } },
          distributor: { select: { name: true } },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async create(data: CreateStockInput) {
    // Resolve prices: use selected price tier if provided, else fall back to product defaults
    let price = 0;
    let salePrice = 0;

    if (data.priceTierId) {
      const priceTier = await prisma.productPrice.findUnique({
        where: { id: data.priceTierId },
        select: { purchasePrice: true, salePrice: true },
      });
      price = priceTier?.purchasePrice ?? 0;
      salePrice = priceTier?.salePrice ?? 0;
    } else {
      const product = await prisma.product.findUnique({
        where: { id: data.productId },
        select: { purchasePrice: true, salePrice: true },
      });
      price = product?.purchasePrice ?? 0;
      salePrice = product?.salePrice ?? 0;
    }

    const totalValue = data.quantity * price;
    const batchNo =
      data.batchNumber?.trim() ||
      (data.invoiceNumber?.trim()
        ? `LOT-${data.invoiceNumber.trim().replace(/\s+/g, "")}`
        : `B-${Date.now().toString().slice(-6)}`);
    const expiry = data.expiry || "2028-12-31";

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let batch = await tx.productBatch.findUnique({
        where: {
          productId_batchNumber: {
            productId: data.productId,
            batchNumber: batchNo,
          },
        },
      });

      if (batch) {
        batch = await tx.productBatch.update({
          where: { id: batch.id },
          data: {
            quantity: { increment: data.quantity },
            initialQty: { increment: data.quantity },
            expiryDate: expiry || batch.expiryDate,
            purchasePrice: price,
            salePrice,
            distributorId: data.distributorId ?? batch.distributorId,
            invoiceNumber: data.invoiceNumber || batch.invoiceNumber,
            active: 1,
          },
        });
      } else {
        batch = await tx.productBatch.create({
          data: {
            productId: data.productId,
            batchNumber: batchNo,
            expiryDate: expiry,
            quantity: data.quantity,
            initialQty: data.quantity,
            purchasePrice: price,
            salePrice,
            distributorId: data.distributorId ?? null,
            invoiceNumber: data.invoiceNumber ?? "",
            active: 1,
          },
        });
      }

      const stockPurchase = await tx.stockPurchase.create({
        data: {
          productId: data.productId,
          distributorId: data.distributorId ?? null,
          invoiceNumber: data.invoiceNumber ?? "",
          batchId: batch.id,
          batchNumber: batchNo,
          quantity: data.quantity,
          purchasePrice: price,
          salePrice,
          stax: data.stax ?? 0,
          expiry,
          totalValue,
          priceTierId: data.priceTierId ?? null,
        },
        include: {
          product: { select: { name: true } },
          distributor: { select: { name: true } },
          batch: true,
          priceTier: true,
        },
      });

      const earliestBatch = await tx.productBatch.findFirst({
        where: { productId: data.productId, active: 1, quantity: { gt: 0 } },
        orderBy: { expiryDate: "asc" },
      });

      await tx.product.update({
        where: { id: data.productId },
        data: {
          stockQty: { increment: data.quantity },
          expiry: earliestBatch?.expiryDate ?? expiry,
        },
      });

      emitEvent("stock:updated", stockPurchase);
      return stockPurchase;
    });
  },

  async update(id: string, data: Partial<CreateStockInput & { quantity: number }>) {
    const old = await prisma.stockPurchase.findUnique({ where: { id } });
    if (!old) throw new NotFoundError("Stock purchase");

    // Resolve prices: use selected price tier if provided, else keep existing prices
    let purchasePrice = old.purchasePrice;
    let salePrice = old.salePrice;

    if (data.priceTierId !== undefined && data.priceTierId !== null) {
      const priceTier = await prisma.productPrice.findUnique({
        where: { id: data.priceTierId },
        select: { purchasePrice: true, salePrice: true },
      });
      if (priceTier) {
        purchasePrice = priceTier.purchasePrice;
        salePrice = priceTier.salePrice;
      }
    }

    const qtyDiff = (data.quantity ?? old.quantity) - old.quantity;
    const totalValue = (data.quantity ?? old.quantity) * purchasePrice;

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.stockPurchase.update({
        where: { id },
        data: {
          quantity: data.quantity ?? old.quantity,
          expiry: data.expiry ?? old.expiry,
          totalValue,
          invoiceNumber: data.invoiceNumber ?? old.invoiceNumber,
          distributorId: data.distributorId ?? old.distributorId,
          stax: data.stax !== undefined ? data.stax : (old as any).stax ?? 0,
          purchasePrice,
          salePrice,
          ...(data.priceTierId !== undefined ? { priceTierId: data.priceTierId } : {}),
        },
        include: {
          product: { select: { name: true } },
          distributor: { select: { name: true } },
          batch: true,
          priceTier: true,
        },
      });

      if (old.batchId) {
        await tx.productBatch.update({
          where: { id: old.batchId },
          data: {
            quantity: { increment: qtyDiff },
            expiryDate: data.expiry ?? old.expiry ?? undefined,
          },
        });
      }

      const earliestBatch = await tx.productBatch.findFirst({
        where: { productId: old.productId, active: 1, quantity: { gt: 0 } },
        orderBy: { expiryDate: "asc" },
      });

      await tx.product.update({
        where: { id: old.productId },
        data: {
          stockQty: { increment: qtyDiff },
          expiry: earliestBatch?.expiryDate ?? undefined,
        },
      });

      return updated;
    });
  },

  async remove(id: string) {
    const old = await prisma.stockPurchase.findUnique({ where: { id } });
    if (!old) throw new NotFoundError("Stock purchase");

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.stockPurchase.update({
        where: { id },
        data: { active: 0 },
      });

      if (old.batchId) {
        await tx.productBatch.update({
          where: { id: old.batchId },
          data: { quantity: { decrement: old.quantity } },
        });
      }

      const earliestBatch = await tx.productBatch.findFirst({
        where: { productId: old.productId, active: 1, quantity: { gt: 0 } },
        orderBy: { expiryDate: "asc" },
      });

      await tx.product.update({
        where: { id: old.productId },
        data: {
          stockQty: { decrement: old.quantity },
          expiry: earliestBatch?.expiryDate ?? undefined,
        },
      });

      return { success: true };
    });
  },

  async restore(id: string) {
    const old = await prisma.stockPurchase.findUnique({ where: { id } });
    if (!old) throw new NotFoundError("Stock purchase");

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.stockPurchase.update({
        where: { id },
        data: { active: 1 },
      });

      if (old.batchId) {
        await tx.productBatch.update({
          where: { id: old.batchId },
          data: { quantity: { increment: old.quantity } },
        });
      }

      const earliestBatch = await tx.productBatch.findFirst({
        where: { productId: old.productId, active: 1, quantity: { gt: 0 } },
        orderBy: { expiryDate: "asc" },
      });

      await tx.product.update({
        where: { id: old.productId },
        data: {
          stockQty: { increment: old.quantity },
          expiry: earliestBatch?.expiryDate ?? undefined,
        },
      });

      return { success: true };
    });
  },

  async hardDelete(id: string) {
    const old = await prisma.stockPurchase.findUnique({ where: { id } });
    if (!old) throw new NotFoundError("Stock purchase");

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (old.active === 1) {
        if (old.batchId) {
          await tx.productBatch.update({
            where: { id: old.batchId },
            data: { quantity: { decrement: old.quantity } },
          });
        }
        const earliestBatch = await tx.productBatch.findFirst({
          where: { productId: old.productId, active: 1, quantity: { gt: 0 } },
          orderBy: { expiryDate: "asc" },
        });
        await tx.product.update({
          where: { id: old.productId },
          data: {
            stockQty: { decrement: old.quantity },
            expiry: earliestBatch?.expiryDate ?? undefined,
          },
        });
      }

      await tx.stockPurchase.delete({ where: { id } });
      return { success: true };
    });
  },
};

