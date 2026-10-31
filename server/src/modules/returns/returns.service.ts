import { prisma } from "../../services/prisma";
import { BadRequestError, NotFoundError } from "../../utils/errors";
import { emitEvent } from "../../socket";
import type { CreateReturnInput } from "./returns.schema";
import { Prisma } from "../../generated/prisma/client";

export const returnsService = {
  async list({
    page = 1,
    limit = 100000,
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

    const [total, data] = await prisma.$transaction([
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
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const sale = await tx.sale.findUnique({
        where: { id: data.saleId },
        include: {
          items: true,
          returns: { include: { items: true } },
        },
      });
      if (!sale) throw new NotFoundError("Sale");

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

      for (const item of data.items) {
        const maxReturnable = (soldQty[item.productId] ?? 0) - (returnedQty[item.productId] ?? 0);
        if (item.quantity > maxReturnable) {
          throw new BadRequestError(
            `Cannot return more than ${maxReturnable} of "${item.productName}" (remaining for this invoice)`
          );
        }
      }

      const returnEntry = await tx.returnEntry.create({
        data: {
          saleId: data.saleId,
          refundAmount: data.refundAmount,
          reason: data.reason ?? "",
        },
      });

      for (const item of data.items) {
        await tx.returnItem.create({
          data: {
            returnId: returnEntry.id,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            refundAmount: item.refundAmount,
          },
        });

        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.quantity } },
        });
      }

      const result = await tx.returnEntry.findUnique({
        where: { id: returnEntry.id },
        include: {
          items: true,
          sale: { include: { customer: { select: { name: true } } } },
        },
      });

      emitEvent("return:created", result);
      return result;
    });
  },
};
