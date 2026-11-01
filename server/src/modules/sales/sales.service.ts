import { prisma } from "../../services/prisma";
import { BadRequestError, NotFoundError } from "../../utils/errors";
import { emitEvent } from "../../socket";
import type { CreateSaleInput } from "./sales.schema";
import { Prisma } from "../../generated/prisma/client";
import { clampPageSize } from "../../utils/pagination";
import { nextSaleId } from "./sales-id";
import { cacheDelNamespace } from "../../utils/cache";

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const salesService = {
  async create(data: CreateSaleInput) {
    const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const saleId = await nextSaleId(tx);
      if (data.customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: data.customerId, active: 1 },
          select: { id: true },
        });
        if (!customer) throw new NotFoundError("Active customer");
      }
      const products = new Map(
        await Promise.all(
          [...new Set(data.items.map((item) => item.productId))].map(async (productId) => {
            const product = await tx.product.findUnique({
              where: { id: productId },
              select: {
                id: true,
                name: true,
                barcode: true,
                active: true,
                purchasePrice: true,
                stockQty: true,
              },
            });
            if (!product || product.active !== 1) {
              throw new NotFoundError("Active product");
            }
            return [productId, product] as const;
          })
        )
      );
      const calculatedSubtotal = data.items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
      );
      const discount = data.discount ?? 0;
      const tax = data.tax ?? 0;
      const total = calculatedSubtotal - discount + tax;
      const amountPaid = Math.min(data.amountPaid, total);

      const sale = await tx.sale.create({
        data: {
          id: saleId,
          kind: "sale",
          customerId: data.customerId ?? null,
          subtotal: calculatedSubtotal,
          discount,
          tax,
          total,
          amountPaid,
          change: Math.max(0, data.amountPaid - total),
          status: amountPaid >= total ? "paid" : "partial",
        },
      });

      for (const item of data.items) {
        const product = products.get(item.productId)!;
        const productStock = await tx.product.updateMany({
          where: {
            id: item.productId,
            active: 1,
            stockQty: { gte: item.quantity },
          },
          data: { stockQty: { decrement: item.quantity } },
        });
        if (productStock.count !== 1) {
          throw new BadRequestError(`Insufficient stock for "${product.name}"`);
        }

        const today = localDateKey(new Date());
        const saleItemData = (quantity: number, batch?: {
          id: string;
          batchNumber: string;
          expiryDate: string | null;
          purchasePrice: number;
        }) => ({
          saleId: sale.id,
          productId: item.productId,
          productName: product.name,
          barcode: product.barcode,
          quantity,
          unitPrice: item.unitPrice,
          purchasePrice: batch?.purchasePrice ?? product.purchasePrice,
          subtotal: item.unitPrice * quantity,
          batchId: batch?.id ?? null,
          batchNumber: batch?.batchNumber ?? null,
          expiry: batch?.expiryDate ?? null,
        });

        if (item.batchId) {
          const batch = await tx.productBatch.findFirst({
            where: {
              id: item.batchId,
              productId: item.productId,
              active: 1,
              quantity: { gte: item.quantity },
              OR: [{ expiryDate: null }, { expiryDate: { gte: today } }],
            },
          });
          if (!batch) {
            throw new BadRequestError(
              `The selected batch for "${product.name}" is expired or has insufficient stock`
            );
          }
          const updated = await tx.productBatch.updateMany({
            where: {
              id: batch.id,
              productId: item.productId,
              active: 1,
              quantity: { gte: item.quantity },
              OR: [{ expiryDate: null }, { expiryDate: { gte: today } }],
            },
            data: { quantity: { decrement: item.quantity } },
          });
          if (updated.count !== 1) {
            throw new BadRequestError(`Insufficient stock in the selected batch of "${product.name}"`);
          }
          await tx.saleItem.create({ data: saleItemData(item.quantity, batch) });
        } else {
          const batches = await tx.productBatch.findMany({
            where: {
              productId: item.productId,
              active: 1,
              quantity: { gt: 0 },
              OR: [{ expiryDate: null }, { expiryDate: { gte: today } }],
            },
            orderBy: [
              { expiryDate: { sort: "asc", nulls: "last" } },
              { createdAt: "asc" },
            ],
          });

          if (batches.length === 0) {
            const anyBatch = await tx.productBatch.findFirst({
              where: { productId: item.productId },
              select: { id: true },
            });
            if (anyBatch) {
              throw new BadRequestError(`No unexpired batch stock is available for "${product.name}"`);
            }
            await tx.saleItem.create({ data: saleItemData(item.quantity) });
          } else {
            let remaining = item.quantity;
            for (const batch of batches) {
              if (remaining === 0) break;
              const quantity = Math.min(batch.quantity, remaining);
              const updated = await tx.productBatch.updateMany({
                where: { id: batch.id, active: 1, quantity: { gte: quantity } },
                data: { quantity: { decrement: quantity } },
              });
              if (updated.count !== 1) {
                throw new BadRequestError(`Batch stock changed during checkout for "${product.name}"`);
              }
              await tx.saleItem.create({ data: saleItemData(quantity, batch) });
              remaining -= quantity;
            }
            if (remaining > 0) {
              throw new BadRequestError(`Insufficient unexpired batch stock for "${product.name}"`);
            }
          }
        }
      }

      if (amountPaid < total && data.customerId) {
        const arrear = await tx.arrear.create({
          data: {
            saleId: sale.id,
            customerId: data.customerId,
            totalBill: total,
            amountPaid,
            balanceDue: total - amountPaid,
            status: "pending",
          },
        });
        if (amountPaid > 0) {
          await tx.arrearPayment.create({
            data: { arrearId: arrear.id, amount: amountPaid },
          });
        }
      }

      const result = await tx.sale.findUnique({
        where: { id: sale.id },
        include: { items: true },
      });

      if (!result) throw new NotFoundError("Sale");

      const customerOutstandingArrear = data.customerId
        ? await tx.arrear
            .aggregate({
              where: { customerId: data.customerId, status: "pending" },
              _sum: { balanceDue: true },
            })
            .then((aggregate) => aggregate._sum.balanceDue ?? 0)
        : 0;
      const saleWithCustomerBalance = {
        ...result,
        customerOutstandingArrear,
      };

      return saleWithCustomerBalance;
    });
    cacheDelNamespace("products");
    emitEvent("sale:created", created);
    return created;
  },

  async listRecent(limit = 10) {
    return prisma.sale.findMany({
      where: { kind: "sale" },
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true } },
        _count: { select: { items: true, returns: true } },
      },
    });
  },

  async listByDate(dateStr: string, tzOffsetMinutes?: number) {
    const offsetMs = (tzOffsetMinutes ?? 0) * 60000;
    const start = new Date(`${dateStr}T00:00:00.000Z`).getTime() - offsetMs;
    const end = start + 24 * 60 * 60 * 1000 - 1;

    return prisma.sale.findMany({
      where: {
        kind: "sale",
        createdAt: { gte: new Date(start), lte: new Date(end) },
      },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true } },
        _count: { select: { items: true, returns: true } },
      },
    });
  },

  async search(q: string, limit = 50) {
    const query = q.trim();
    return prisma.sale.findMany({
      where: {
        kind: "sale",
        OR: [
          { id: { contains: query, mode: "insensitive" } },
          { customer: { is: { name: { contains: query, mode: "insensitive" } } } },
          { items: { some: { productName: { contains: query, mode: "insensitive" } } } },
          { items: { some: { barcode: { contains: query, mode: "insensitive" } } } },
          { items: { some: { product: { is: { barcode: { contains: query, mode: "insensitive" } } } } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        customer: { select: { name: true } },
        items: true,
        returns: { include: { items: true } },
        _count: { select: { items: true, returns: true } },
      },
    });
  },

  async listAll(opts?: {
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    tzOffsetMinutes?: number;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const where: Record<string, unknown> = { kind: "sale" };
    const offsetMs = (opts?.tzOffsetMinutes ?? 0) * 60000;

    if (opts?.dateFrom || opts?.dateTo) {
      where.createdAt = {};
      if (opts.dateFrom) {
        (where.createdAt as Record<string, Date>).gte = new Date(
          new Date(`${opts.dateFrom}T00:00:00.000Z`).getTime() - offsetMs
        );
      }
      if (opts.dateTo) {
        (where.createdAt as Record<string, Date>).lte = new Date(
          new Date(`${opts.dateTo}T23:59:59.999Z`).getTime() - offsetMs
        );
      }
    }

    const search = opts?.search?.trim();
    if (search) {
      where.OR = [
        { id: { contains: search, mode: "insensitive" } },
        { customer: { is: { name: { contains: search, mode: "insensitive" } } } },
        { items: { some: { productName: { contains: search, mode: "insensitive" } } } },
        { items: { some: { barcode: { contains: search, mode: "insensitive" } } } },
        { items: { some: { product: { is: { barcode: { contains: search, mode: "insensitive" } } } } } },
      ];
    }

    const page = opts?.page || 1;
    const limit = clampPageSize(opts?.limit);
    const skip = (page - 1) * limit;

    let orderBy: Prisma.SaleOrderByWithRelationInput = { createdAt: opts?.sortOrder || "desc" };
    if (opts?.sortBy === "total") {
      orderBy = { total: opts?.sortOrder || "desc" };
    } else if (opts?.sortBy === "discount") {
      orderBy = { discount: opts?.sortOrder || "desc" };
    } else if (opts?.sortBy === "subtotal") {
      orderBy = { subtotal: opts?.sortOrder || "desc" };
    } else if (opts?.sortBy === "createdAt" || opts?.sortBy === "created_at" || opts?.sortBy === "date") {
      orderBy = { createdAt: opts?.sortOrder || "desc" };
    }

    const [total, sales] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where,
        orderBy,
        take: limit,
        skip,
        include: {
          customer: { select: { name: true } },
          items: true,
          _count: { select: { items: true, returns: true } },
        },
      }),
    ]);

    const data = sales.map((sale) => {
      const rawProfit = sale.items.reduce((sum, item) => {
        const purchasePrice = item.purchasePrice;
        return sum + (item.unitPrice - purchasePrice) * item.quantity;
      }, 0);
      const discountRatio = sale.subtotal > 0 ? sale.discount / sale.subtotal : 0;
      const adjustedProfit = rawProfit * (1 - discountRatio);
      const { items, ...rest } = sale;
      return { ...rest, profit: Math.round(adjustedProfit) };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  async getById(id: string) {
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true } },
        items: true,
        returns: { include: { items: true } },
        _count: { select: { returns: true } },
      },
    });
    if (!sale) throw new NotFoundError("Sale");

    const rawProfit = sale.items.reduce((sum, item) => {
      const purchasePrice = item.purchasePrice;
      return sum + (item.unitPrice - purchasePrice) * item.quantity;
    }, 0);
    const discountRatio = sale.subtotal > 0 ? sale.discount / sale.subtotal : 0;
    const adjustedProfit = rawProfit * (1 - discountRatio);

    const { items, ...rest } = sale;
    return { ...rest, items, profit: Math.round(adjustedProfit) };
  },
};
