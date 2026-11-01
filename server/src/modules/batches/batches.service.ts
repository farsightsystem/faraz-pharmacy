import { prisma } from "../../services/prisma";

export const batchesService = {
  async listByProduct(productId: string) {
    return prisma.productBatch.findMany({
      where: {
        productId,
        active: 1,
        quantity: { gt: 0 },
      },
      orderBy: { expiryDate: "asc" },
      include: {
        distributor: { select: { id: true, name: true } },
      },
    });
  },

  async listExpiring(days = 60) {
    const now = new Date();
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);

    const targetDateStr = targetDate.toISOString().slice(0, 10);

    return prisma.productBatch.findMany({
      where: {
        active: 1,
        quantity: { gt: 0 },
        expiryDate: { lte: targetDateStr },
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
        orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }],
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
