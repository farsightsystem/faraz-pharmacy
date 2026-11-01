import { prisma, Prisma } from "../../services/prisma";
import { BadRequestError, NotFoundError } from "../../utils/errors";
import { emitEvent } from "../../socket";
import { cacheDelNamespace } from "../../utils/cache";
import { clampPageSize } from "../../utils/pagination";
import type { CreateStockInput } from "./purchases.schema";

export const purchasesService = {
  async list({
    page = 1,
    limit = 200,
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
    limit = clampPageSize(limit);
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

    const [total, data] = await Promise.all([
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
      const priceTier = await prisma.productPrice.findFirst({
        where: { id: data.priceTierId, productId: data.productId },
        select: { purchasePrice: true, salePrice: true },
      });
      if (!priceTier) {
        throw new BadRequestError("The selected price tier does not belong to this product");
      }
      price = priceTier.purchasePrice;
      salePrice = priceTier.salePrice;
    } else {
      const product = await prisma.product.findUnique({
        where: { id: data.productId },
        select: { purchasePrice: true, salePrice: true },
      });
      if (!product) throw new NotFoundError("Product");
      price = product.purchasePrice;
      salePrice = product.salePrice;
    }

    if (salePrice <= price) {
      throw new BadRequestError(
        "Sale price must be greater than purchase price. Update the product pricing before receiving stock."
      );
    }

    const totalValue = data.quantity * price;
    const batchNo =
      data.batchNumber?.trim() ||
      (data.invoiceNumber?.trim()
        ? `LOT-${data.invoiceNumber.trim().replace(/\s+/g, "")}`
        : `B-${Date.now().toString().slice(-6)}`);
    const expiry = data.expiry || null;

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
            expiryDate: expiry ?? batch.expiryDate,
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
        orderBy: { expiryDate: { sort: "asc", nulls: "last" } },
      });

      await tx.product.update({
        where: { id: data.productId },
        data: {
          stockQty: { increment: data.quantity },
          expiry: earliestBatch?.expiryDate ?? expiry,
        },
      });

      cacheDelNamespace("products"); // invalidate product cache on stock write
      emitEvent("stock:updated", stockPurchase);
      return stockPurchase;
    });
  },

  async update(id: string, data: Partial<CreateStockInput & { quantity: number }>) {
    const old = await prisma.stockPurchase.findUnique({ where: { id } });
    if (!old) throw new NotFoundError("Stock purchase");
    if (old.active !== 1) {
      throw new NotFoundError("Active stock purchase");
    }

    // Resolve prices: use selected price tier if provided, else keep existing prices
    let purchasePrice = old.purchasePrice;
    let salePrice = old.salePrice;

    if (data.priceTierId !== undefined) {
      if (data.priceTierId === null) {
        const product = await prisma.product.findUnique({
          where: { id: old.productId },
          select: { purchasePrice: true, salePrice: true },
        });
        if (!product) throw new NotFoundError("Product");
        purchasePrice = product.purchasePrice;
        salePrice = product.salePrice;
      } else {
        const priceTier = await prisma.productPrice.findFirst({
          where: { id: data.priceTierId, productId: old.productId },
          select: { purchasePrice: true, salePrice: true },
        });
        if (!priceTier) {
          throw new BadRequestError("The selected price tier does not belong to this product");
        }
        purchasePrice = priceTier.purchasePrice;
        salePrice = priceTier.salePrice;
      }

      if (salePrice <= purchasePrice) {
        throw new BadRequestError(
          "Sale price must be greater than purchase price. Update the product pricing before receiving stock."
        );
      }
    }

    const qtyDiff = (data.quantity ?? old.quantity) - old.quantity;
    const totalValue = (data.quantity ?? old.quantity) * purchasePrice;

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM stock_purchases WHERE id = ${id} FOR UPDATE`;
      const current = await tx.stockPurchase.findUnique({ where: { id } });
      if (!current || current.active !== 1 || current.quantity !== old.quantity) {
        throw new BadRequestError("This purchase changed while it was being edited; reload and try again");
      }

      if (qtyDiff < 0) {
        const quantityToRemove = -qtyDiff;
        if (old.batchId) {
          const batch = await tx.productBatch.findFirst({
            where: { id: old.batchId, quantity: { gte: quantityToRemove } },
            select: { id: true },
          });
          if (!batch) {
            throw new BadRequestError("Cannot reduce this purchase below the stock already sold or otherwise used");
          }
        }
        const product = await tx.product.findFirst({
          where: { id: old.productId, stockQty: { gte: quantityToRemove } },
          select: { id: true },
        });
        if (!product) {
          throw new BadRequestError("Cannot reduce this purchase below the stock already sold or otherwise used");
        }
      }

      const updated = await tx.stockPurchase.update({
        where: { id },
        data: {
          quantity: data.quantity ?? old.quantity,
          ...(data.expiry !== undefined ? { expiry: data.expiry } : {}),
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
        const batchData = {
          quantity: { increment: qtyDiff },
          initialQty: { increment: qtyDiff },
          ...(data.expiry !== undefined ? { expiryDate: data.expiry } : {}),
        };
        if (qtyDiff < 0) {
          const batchUpdate = await tx.productBatch.updateMany({
            where: { id: old.batchId, quantity: { gte: -qtyDiff } },
            data: batchData,
          });
          if (batchUpdate.count !== 1) {
            throw new BadRequestError("Cannot reduce this purchase below the stock already sold or otherwise used");
          }
        } else {
          await tx.productBatch.update({ where: { id: old.batchId }, data: batchData });
        }
      }

      const earliestBatch = await tx.productBatch.findFirst({
        where: { productId: old.productId, active: 1, quantity: { gt: 0 } },
        orderBy: { expiryDate: { sort: "asc", nulls: "last" } },
      });

      const productData = {
        stockQty: { increment: qtyDiff },
        expiry: earliestBatch?.expiryDate ?? null,
      };
      if (qtyDiff < 0) {
        const productUpdate = await tx.product.updateMany({
          where: { id: old.productId, stockQty: { gte: -qtyDiff } },
          data: productData,
        });
        if (productUpdate.count !== 1) {
          throw new BadRequestError("Cannot reduce this purchase below the stock already sold or otherwise used");
        }
      } else {
        await tx.product.update({ where: { id: old.productId }, data: productData });
      }

      return updated;
    });
    cacheDelNamespace("products"); // invalidate product cache on stock write
    return result;
  },

  async remove(id: string) {
    const old = await prisma.stockPurchase.findUnique({ where: { id } });
    if (!old) throw new NotFoundError("Stock purchase");

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM stock_purchases WHERE id = ${id} FOR UPDATE`;
      const current = await tx.stockPurchase.findUnique({ where: { id } });
      if (!current) throw new NotFoundError("Stock purchase");
      if (current.active === 0) return { success: true };
      if (current.quantity !== old.quantity) {
        throw new BadRequestError("This purchase changed while it was being removed; reload and try again");
      }

      const archived = await tx.stockPurchase.updateMany({
        where: { id, active: 1, quantity: old.quantity },
        data: { active: 0 },
      });
      if (archived.count === 0) return { success: true };

      if (old.batchId) {
        const batchUpdate = await tx.productBatch.updateMany({
          where: { id: old.batchId, quantity: { gte: old.quantity } },
          data: {
            quantity: { decrement: old.quantity },
            initialQty: { decrement: old.quantity },
          },
        });
        if (batchUpdate.count !== 1) {
          throw new BadRequestError("Cannot remove this purchase because some of its stock has already been sold or otherwise used");
        }
      }

      const productUpdate = await tx.product.updateMany({
        where: { id: old.productId, stockQty: { gte: old.quantity } },
        data: { stockQty: { decrement: old.quantity } },
      });
      if (productUpdate.count !== 1) {
        throw new BadRequestError("Cannot remove this purchase because some of its stock has already been sold or otherwise used");
      }

      const earliestBatch = await tx.productBatch.findFirst({
        where: { productId: old.productId, active: 1, quantity: { gt: 0 } },
        orderBy: { expiryDate: { sort: "asc", nulls: "last" } },
      });

      await tx.product.update({
        where: { id: old.productId },
        data: { expiry: earliestBatch?.expiryDate ?? null },
      });

      return { success: true };
    });
    cacheDelNamespace("products"); // invalidate product cache on stock write
    return result;
  },

  async restore(id: string) {
    const old = await prisma.stockPurchase.findUnique({ where: { id } });
    if (!old) throw new NotFoundError("Stock purchase");

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM stock_purchases WHERE id = ${id} FOR UPDATE`;
      const current = await tx.stockPurchase.findUnique({ where: { id } });
      if (!current) throw new NotFoundError("Stock purchase");
      if (current.active === 1) return { success: true };
      if (current.quantity !== old.quantity) {
        throw new BadRequestError("This purchase changed while it was being restored; reload and try again");
      }

      const restored = await tx.stockPurchase.updateMany({
        where: { id, active: 0, quantity: old.quantity },
        data: { active: 1 },
      });
      if (restored.count === 0) return { success: true };

      if (old.batchId) {
        await tx.productBatch.update({
          where: { id: old.batchId },
          data: {
            quantity: { increment: old.quantity },
            initialQty: { increment: old.quantity },
          },
        });
      }

      const earliestBatch = await tx.productBatch.findFirst({
        where: { productId: old.productId, active: 1, quantity: { gt: 0 } },
        orderBy: { expiryDate: { sort: "asc", nulls: "last" } },
      });

      await tx.product.update({
        where: { id: old.productId },
        data: {
          stockQty: { increment: old.quantity },
          expiry: earliestBatch?.expiryDate ?? null,
        },
      });

      return { success: true };
    });
    cacheDelNamespace("products"); // invalidate product cache on stock write
    return result;
  },

  async hardDelete(id: string) {
    const old = await prisma.stockPurchase.findUnique({ where: { id } });
    if (!old) throw new NotFoundError("Stock purchase");

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM stock_purchases WHERE id = ${id} FOR UPDATE`;
      const current = await tx.stockPurchase.findUnique({ where: { id } });
      if (!current) throw new NotFoundError("Stock purchase");

      if (current.active === 1) {
        if (current.batchId) {
          const batchUpdate = await tx.productBatch.updateMany({
            where: { id: current.batchId, quantity: { gte: current.quantity } },
            data: {
              quantity: { decrement: current.quantity },
              initialQty: { decrement: current.quantity },
            },
          });
          if (batchUpdate.count !== 1) {
            throw new BadRequestError("Cannot delete this purchase because some of its stock has already been sold or otherwise used");
          }
        }
        const productUpdate = await tx.product.updateMany({
          where: { id: current.productId, stockQty: { gte: current.quantity } },
          data: { stockQty: { decrement: current.quantity } },
        });
        if (productUpdate.count !== 1) {
          throw new BadRequestError("Cannot delete this purchase because some of its stock has already been sold or otherwise used");
        }
        const earliestBatch = await tx.productBatch.findFirst({
          where: { productId: current.productId, active: 1, quantity: { gt: 0 } },
          orderBy: { expiryDate: { sort: "asc", nulls: "last" } },
        });
        await tx.product.update({
          where: { id: current.productId },
          data: { expiry: earliestBatch?.expiryDate ?? null },
        });
      }

      await tx.stockPurchase.delete({ where: { id } });
      return { success: true };
    });
    cacheDelNamespace("products"); // invalidate product cache on stock write
    return result;
  },
};
