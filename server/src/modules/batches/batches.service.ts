import { prisma } from "../../services/prisma";

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

export const batchesService = {
  async listByProduct(productId: string) {
    const today = dateKey(new Date());
    return prisma.productBatch.findMany({
      where: {
        productId,
        active: 1,
        quantity: { gt: 0 },
        OR: [{ expiryDate: null }, { expiryDate: { gte: today } }],
      },
      orderBy: { expiryDate: { sort: "asc", nulls: "last" } },
      include: {
        distributor: { select: { id: true, name: true } },
      },
    });
  },

  async listExpiring(days = 60) {
    const now = new Date();
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);

    const today = dateKey(now);
    const targetDateStr = dateKey(targetDate);

    return prisma.productBatch.findMany({
      where: {
        active: 1,
        quantity: { gt: 0 },
        expiryDate: { gte: today, lte: targetDateStr },
      },
      orderBy: { expiryDate: "asc" },
      include: {
        product: { select: { id: true, name: true, barcode: true, category: true, location: true } },
        distributor: { select: { id: true, name: true } },
      },
    });
  },

  async traceBatch(batchNumber: string) {
    const q = batchNumber.trim();
    if (!q) return null;

    const batches = await prisma.productBatch.findMany({
      where: {
        batchNumber: { equals: q, mode: "insensitive" },
      },
      include: {
        product: { select: { id: true, name: true, barcode: true } },
        distributor: { select: { id: true, name: true } },
        stockPurchases: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            invoiceNumber: true,
            quantity: true,
            purchasePrice: true,
            createdAt: true,
            distributor: { select: { name: true } },
          },
        },
        saleItems: {
          orderBy: { sale: { createdAt: "desc" } },
          take: 100,
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            subtotal: true,
            sale: {
              select: {
                id: true,
                createdAt: true,
                customer: { select: { id: true, name: true, phone: true } },
              },
            },
          },
        },
      },
    });

    return batches;
  },

  async listAll({
    page = 1,
    limit = 50,
    search = "",
    productId,
  }: {
    page?: number;
    limit?: number;
    search?: string;
    productId?: string;
  } = {}) {
    const where: any = { active: 1 };
    if (productId) where.productId = productId;
    if (search.trim()) {
      const q = search.trim();
      where.OR = [
        { batchNumber: { contains: q, mode: "insensitive" } },
        { invoiceNumber: { contains: q, mode: "insensitive" } },
        { product: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const skip = (page - 1) * limit;
    const [total, data] = await Promise.all([
      prisma.productBatch.count({ where }),
      prisma.productBatch.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { expiryDate: { sort: "asc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        include: {
          product: { select: { id: true, name: true, barcode: true } },
          distributor: { select: { id: true, name: true } },
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
};
