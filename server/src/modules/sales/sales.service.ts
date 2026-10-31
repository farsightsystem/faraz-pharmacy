import { prisma } from "../../services/prisma";
import { NotFoundError } from "../../utils/errors";
import { emitEvent } from "../../socket";
import type { CreateSaleInput } from "./sales.schema";
import { Prisma } from "../../generated/prisma/client";

export const salesService = {
  async create(data: CreateSaleInput) {
    const now = new Date();
    const yy = now.getFullYear().toString().slice(-2);
    const mm = (now.getMonth() + 1).toString().padStart(2, "0");
    const prefix = `${yy}${mm}-`;

    const last = await prisma.sale.findFirst({
      where: { id: { startsWith: prefix } },
      orderBy: { id: "desc" },
    });

    let nextNum = 1;
    if (last) {
      nextNum = parseInt(last.id.slice(-6), 10) + 1;
    }
    const saleId = `${prefix}${nextNum.toString().padStart(6, "0")}`;

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const sale = await tx.sale.create({
        data: {
          id: saleId,
          customerId: data.customerId ?? null,
          subtotal: data.subtotal,
          discount: data.discount,
          tax: data.tax ?? 0,
          total: data.total,
          amountPaid: data.amountPaid,
          change: Math.max(0, data.amountPaid - data.total),
          status: data.amountPaid >= data.total ? "paid" : "partial",
        },
      });

      for (const item of data.items) {
        let assignedBatchId = item.batchId ?? null;
        let assignedBatchNo = item.batchNumber ?? null;
        let assignedExpiry = item.expiry ?? null;

        if (assignedBatchId) {
          const specifiedBatch = await tx.productBatch.findUnique({
            where: { id: assignedBatchId },
          });
          if (specifiedBatch) {
            assignedBatchNo = specifiedBatch.batchNumber;
            assignedExpiry = specifiedBatch.expiryDate;
            await tx.productBatch.update({
              where: { id: specifiedBatch.id },
              data: { quantity: { decrement: item.quantity } },
            });
          }
        } else {
          // Automatic FEFO: Find the active batch expiring earliest with remaining stock
          const fefoBatch = await tx.productBatch.findFirst({
            where: {
              productId: item.productId,
              active: 1,
              quantity: { gt: 0 },
            },
            orderBy: { expiryDate: "asc" },
          });

          if (fefoBatch) {
            assignedBatchId = fefoBatch.id;
            assignedBatchNo = fefoBatch.batchNumber;
            assignedExpiry = fefoBatch.expiryDate;
            await tx.productBatch.update({
              where: { id: fefoBatch.id },
              data: { quantity: { decrement: item.quantity } },
            });
          }
        }

        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: item.productId,
            productName: item.productName,
            barcode: item.barcode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            batchId: assignedBatchId,
            batchNumber: assignedBatchNo,
            expiry: assignedExpiry,
          },
        });

        const nextEarliestBatch = await tx.productBatch.findFirst({
          where: { productId: item.productId, active: 1, quantity: { gt: 0 } },
          orderBy: { expiryDate: "asc" },
        });

        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQty: { decrement: item.quantity },
            expiry: nextEarliestBatch?.expiryDate ?? undefined,
          },
        });
      }

      if (data.amountPaid < data.total && data.customerId) {
        await tx.arrear.create({
          data: {
            saleId: sale.id,
            customerId: data.customerId,
            totalBill: data.total,
            amountPaid: data.amountPaid,
            balanceDue: data.total - data.amountPaid,
            status: "pending",
          },
        });
      }

      const result = await tx.sale.findUnique({
        where: { id: sale.id },
        include: { items: true },
      });

      emitEvent("sale:created", result);
      return result;
    });
  },

  async listRecent(limit = 10) {
    return prisma.sale.findMany({
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
      where: { createdAt: { gte: new Date(start), lte: new Date(end) } },
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
    const where: Record<string, unknown> = {};
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
    const limit = opts?.limit || 100000;
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

    const [total, sales] = await prisma.$transaction([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where,
        orderBy,
        take: limit,
        skip,
        include: {
          customer: { select: { name: true } },
          items: {
            include: { product: { select: { purchasePrice: true } } },
          },
          _count: { select: { items: true, returns: true } },
        },
      }),
    ]);

    const data = sales.map((sale) => {
      const rawProfit = sale.items.reduce((sum, item) => {
        const purchasePrice = item.product?.purchasePrice ?? 0;
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
        items: {
          include: { product: { select: { purchasePrice: true } } },
        },
        returns: { include: { items: true } },
        _count: { select: { returns: true } },
      },
    });
    if (!sale) throw new NotFoundError("Sale");

    const rawProfit = sale.items.reduce((sum, item) => {
      const purchasePrice = item.product?.purchasePrice ?? 0;
      return sum + (item.unitPrice - purchasePrice) * item.quantity;
    }, 0);
    const discountRatio = sale.subtotal > 0 ? sale.discount / sale.subtotal : 0;
    const adjustedProfit = rawProfit * (1 - discountRatio);

    const { items, ...rest } = sale;
    return { ...rest, items, profit: Math.round(adjustedProfit) };
  },
};
