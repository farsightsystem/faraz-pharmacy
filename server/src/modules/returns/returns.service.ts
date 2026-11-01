import { prisma } from "../../services/prisma";
import { BadRequestError, NotFoundError } from "../../utils/errors";
import { emitEvent } from "../../socket";
import type { CreateReturnInput } from "./returns.schema";
import { Prisma } from "../../generated/prisma/client";
import { clampPageSize } from "../../utils/pagination";
import { cacheDelNamespace } from "../../utils/cache";

export const returnsService = {
  async list({
    page = 1,
    limit = 200,
    search,
    sortBy,
    sortOrder,
  }: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  } = {}) {
    limit = clampPageSize(limit);
    const where: Prisma.ReturnEntryWhereInput = {};

    if (search) {
      const q = search.trim();
      where.OR = [
        { id: { contains: q, mode: "insensitive" } },
        { saleId: { contains: q, mode: "insensitive" } },
        { reason: { contains: q, mode: "insensitive" } },
        { sale: { is: { customer: { is: { name: { contains: q, mode: "insensitive" } } } } } },
        { items: { some: { productName: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const skip = (page - 1) * limit;

    let orderBy: Prisma.ReturnEntryOrderByWithRelationInput = { createdAt: sortOrder || "desc" };
    if (sortBy === "refundAmount" || sortBy === "refund_amount") {
      orderBy = { refundAmount: sortOrder || "desc" };
    } else if (sortBy === "createdAt" || sortBy === "created_at" || sortBy === "date") {
      orderBy = { createdAt: sortOrder || "desc" };
    }

    const [total, data] = await Promise.all([
      prisma.returnEntry.count({ where }),
      prisma.returnEntry.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          items: true,
          sale: { include: { customer: { select: { name: true } } } },
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

  async getById(id: string) {
    const entry = await prisma.returnEntry.findUnique({
      where: { id },
      include: {
        items: true,
        sale: { include: { customer: { select: { name: true } } } },
      },
    });
    if (!entry) throw new NotFoundError("Return");
    return entry;
  },

  async create(data: CreateReturnInput) {
    const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM arrears WHERE sale_id = ${data.saleId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM sales WHERE id = ${data.saleId} FOR UPDATE`;
      const sale = await tx.sale.findUnique({
        where: { id: data.saleId },
        include: {
          items: true,
          returns: { include: { items: true } },
        },
      });
      if (!sale) throw new NotFoundError("Sale");
      if (sale.kind !== "sale" || sale.items.length === 0) {
        throw new BadRequestError("Only completed product sales can be returned");
      }

      const soldQty: Record<string, number> = {};
      for (const si of sale.items) {
        soldQty[si.productId] = (soldQty[si.productId] ?? 0) + si.quantity;
      }

      const returnedQty: Record<string, number> = {};
      for (const r of sale.returns) {
        for (const ri of r.items) {
          returnedQty[ri.productId] = (returnedQty[ri.productId] ?? 0) + ri.quantity;
        }
      }

      const requestedQty = new Map<string, number>();
      for (const item of data.items) {
        requestedQty.set(
          item.productId,
          (requestedQty.get(item.productId) ?? 0) + item.quantity
        );
      }
      for (const [productId, quantity] of requestedQty) {
        const maxReturnable = (soldQty[productId] ?? 0) - (returnedQty[productId] ?? 0);
        if (quantity > maxReturnable) {
          throw new BadRequestError(
            `Cannot return more than ${maxReturnable} unit(s) of this product (remaining for this invoice)`
          );
        }
      }

      const discountRatio = sale.subtotal > 0 ? sale.discount / sale.subtotal : 0;
      const taxRatio = sale.subtotal > 0 ? sale.tax / sale.subtotal : 0;
      const allocations: Array<{
        productId: string;
        productName: string;
        quantity: number;
        batchId: string | null;
        purchasePrice: number;
        refundAmount: number;
      }> = [];
      let totalRefundValue = 0;

      for (const [productId, quantity] of requestedQty) {
        const saleItems = sale.items.filter((item) => item.productId === productId);
        let alreadyReturnedWithoutBatch = sale.returns
          .flatMap((entry) => entry.items)
          .filter((item) => item.productId === productId && !item.batchId)
          .reduce((sum, item) => sum + item.quantity, 0);
        const returnedByBatch = new Map<string, number>();
        for (const returnedItem of sale.returns.flatMap((entry) => entry.items)) {
          if (returnedItem.productId === productId && returnedItem.batchId) {
            returnedByBatch.set(
              returnedItem.batchId,
              (returnedByBatch.get(returnedItem.batchId) ?? 0) + returnedItem.quantity
            );
          }
        }

        const remainingBySaleItem = saleItems.map((item) => {
          const tracked = item.batchId
            ? Math.min(item.quantity, returnedByBatch.get(item.batchId) ?? 0)
            : 0;
          if (item.batchId && tracked > 0) {
            returnedByBatch.set(item.batchId, (returnedByBatch.get(item.batchId) ?? 0) - tracked);
          }
          return { item, remaining: Math.max(0, item.quantity - tracked) };
        });
        for (const remaining of remainingBySaleItem) {
          if (alreadyReturnedWithoutBatch === 0) break;
          const consumed = Math.min(remaining.remaining, alreadyReturnedWithoutBatch);
          remaining.remaining -= consumed;
          alreadyReturnedWithoutBatch -= consumed;
        }

        let remainingToAllocate = quantity;
        let productRefundValue = 0;
        const productAllocations: typeof allocations = [];
        for (const remaining of remainingBySaleItem) {
          if (remainingToAllocate === 0) break;
          if (remaining.remaining === 0) continue;
          const allocatedQuantity = Math.min(remaining.remaining, remainingToAllocate);
          const lineValue = Math.round(
            remaining.item.unitPrice *
              allocatedQuantity *
              (1 - discountRatio + taxRatio)
          );
          productRefundValue += lineValue;
          productAllocations.push({
            productId,
            productName: remaining.item.productName,
            quantity: allocatedQuantity,
            batchId: remaining.item.batchId,
            purchasePrice: remaining.item.purchasePrice,
            refundAmount: lineValue,
          });
          remainingToAllocate -= allocatedQuantity;
        }
        if (remainingToAllocate > 0) {
          throw new BadRequestError("Return quantities changed; reload the invoice and try again");
        }
        totalRefundValue += productRefundValue;
        allocations.push(...productAllocations);
      }

      const arrear = await tx.arrear.findFirst({ where: { saleId: sale.id } });
      let creditApplied = 0;
      let cashRefunded = totalRefundValue;
      if (arrear) {
        if (totalRefundValue > arrear.balanceDue + arrear.amountPaid + 0.001) {
          throw new BadRequestError("The return value exceeds the remaining amount due and paid on this invoice");
        }
        creditApplied = Math.min(totalRefundValue, arrear.balanceDue);
        cashRefunded = totalRefundValue - creditApplied;
        const nextTotalBill = Math.max(0, arrear.totalBill - totalRefundValue);
        const nextBalanceDue = Math.max(0, arrear.balanceDue - creditApplied);
        const nextAmountPaid = Math.max(0, arrear.amountPaid - cashRefunded);
        await tx.arrear.update({
          where: { id: arrear.id },
          data: {
            totalBill: nextTotalBill,
            balanceDue: nextBalanceDue,
            amountPaid: nextAmountPaid,
            status: nextBalanceDue <= 0 ? "settled" : "pending",
          },
        });
        await tx.sale.update({
          where: { id: sale.id },
          data: { status: nextBalanceDue <= 0 ? "paid" : "partial" },
        });
      } else {
        const collected = Math.max(0, sale.amountPaid);
        const alreadyRefunded = sale.returns.reduce((sum, entry) => sum + entry.cashRefunded, 0);
        if (cashRefunded > collected - alreadyRefunded + 0.001) {
          throw new BadRequestError("The return value exceeds the amount collected for this sale");
        }
      }

      const returnEntry = await tx.returnEntry.create({
        data: {
          saleId: data.saleId,
          refundAmount: totalRefundValue,
          creditApplied,
          cashRefunded,
          reason: data.reason ?? "",
        },
      });

      for (const item of allocations) {
        await tx.returnItem.create({
          data: {
            returnId: returnEntry.id,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            refundAmount: item.refundAmount,
            batchId: item.batchId,
            purchasePrice: item.purchasePrice,
          },
        });
      }

      const result = await tx.returnEntry.findUnique({
        where: { id: returnEntry.id },
        include: {
          items: true,
          sale: { include: { customer: { select: { name: true } } } },
        },
      });

      return result;
    });
    emitEvent("return:created", created);
    return created;
  },

  async setDisposition(itemId: string, action: "restock" | "dispose") {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM return_items WHERE id = ${itemId} FOR UPDATE`;
      const item = await tx.returnItem.findUnique({
        where: { id: itemId },
        include: { product: true, batch: true },
      });
      if (!item) throw new NotFoundError("Returned item");
      if (item.inventoryStatus !== "quarantined") {
        throw new BadRequestError("This returned item has already been inspected");
      }

      if (action === "dispose") {
        return tx.returnItem.update({
          where: { id: item.id },
          data: { inventoryStatus: "disposed" },
        });
      }

      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
        now.getDate()
      ).padStart(2, "0")}`;
      let batchId = item.batchId;
      if (item.batchId) {
        if (
          !item.batch ||
          item.batch.active !== 1 ||
          (item.batch.expiryDate && item.batch.expiryDate < today)
        ) {
          throw new BadRequestError("The original batch is inactive or expired; this item cannot be restocked");
        }
        await tx.productBatch.update({
          where: { id: item.batchId },
          data: { quantity: { increment: item.quantity } },
        });
      } else {
        const batchNumber = `RET-${item.id}`;
        const batch = await tx.productBatch.create({
          data: {
            productId: item.productId,
            batchNumber,
            expiryDate: null,
            quantity: item.quantity,
            initialQty: item.quantity,
            purchasePrice: item.purchasePrice,
            salePrice: item.product.salePrice,
            invoiceNumber: `RETURN-${item.returnId}`,
            active: 1,
          },
        });
        batchId = batch.id;
      }

      await tx.product.update({
        where: { id: item.productId },
        data: { stockQty: { increment: item.quantity } },
      });
      const earliestBatch = await tx.productBatch.findFirst({
        where: { productId: item.productId, active: 1, quantity: { gt: 0 } },
        orderBy: { expiryDate: { sort: "asc", nulls: "last" } },
        select: { expiryDate: true },
      });
      await tx.product.update({
        where: { id: item.productId },
        data: { expiry: earliestBatch?.expiryDate ?? null },
      });

      return tx.returnItem.update({
        where: { id: item.id },
        data: { inventoryStatus: "restocked", batchId },
      });
    });
    if (action === "restock") cacheDelNamespace("products");
    return result;
  },
};
