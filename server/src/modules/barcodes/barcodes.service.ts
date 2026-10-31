import { prisma, Prisma } from "../../services/prisma";
import { BadRequestError, NotFoundError } from "../../utils/errors";

export const barcodesService = {
  async list({
    page = 1,
    limit = 50,
    search,
    includeArchived = false,
    sortBy,
    sortOrder,
  }: {
    page?: number;
    limit?: number;
    search?: string;
    includeArchived?: boolean;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  } = {}) {
    const where: Prisma.BarcodeWhereInput = {};
    const conditions: Prisma.BarcodeWhereInput[] = [];

    if (!includeArchived) {
      conditions.push({
        OR: [
          { productId: null },
          { product: { active: 1 } },
        ],
      });
    }

    if (search && search.trim()) {
      const q = search.trim();
      conditions.push({
        OR: [
          { code: { contains: q, mode: "insensitive" } },
          { product: { name: { contains: q, mode: "insensitive" } } },
        ],
      });
    }

    if (conditions.length > 0) {
      where.AND = conditions;
    }

    const skip = (page - 1) * limit;

    let orderBy: Prisma.BarcodeOrderByWithRelationInput = { createdAt: sortOrder || "desc" };
    if (sortBy === "code" || sortBy === "barcode") {
      orderBy = { code: sortOrder || "asc" };
    } else if (sortBy === "productName" || sortBy === "name") {
      orderBy = { product: { name: sortOrder || "asc" } };
    } else if (sortBy === "createdAt" || sortBy === "created_at") {
      orderBy = { createdAt: sortOrder || "desc" };
    }

    const [total, data] = await prisma.$transaction([
      prisma.barcode.count({ where }),
      prisma.barcode.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          product: {
            select: { name: true, active: true },
          },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  },

  async create(code: string) {
    const existing = await prisma.barcode.findUnique({ where: { code } });
    if (existing) {
      throw new BadRequestError("Barcode already exists");
    }
    return prisma.barcode.create({
      data: { code },
      include: { product: { select: { name: true, active: true } } },
    });
  },

  async archive(id: string) {
    const barcode = await prisma.barcode.findUnique({ where: { id } });
    if (!barcode) throw new NotFoundError("Barcode");
    if (!barcode.productId) {
      throw new BadRequestError("Cannot archive a barcode without a product");
    }
    // Archive the linked product
    await prisma.product.update({
      where: { id: barcode.productId },
      data: { active: 0 },
    });
    return { success: true };
  },

  async restore(id: string) {
    const barcode = await prisma.barcode.findUnique({ where: { id } });
    if (!barcode) throw new NotFoundError("Barcode");
    if (!barcode.productId) {
      throw new BadRequestError("Cannot restore a barcode without a product");
    }
    // Restore the linked product
    await prisma.product.update({
      where: { id: barcode.productId },
      data: { active: 1 },
    });
    return { success: true };
  },

  async remove(id: string) {
    const barcode = await prisma.barcode.findUnique({ where: { id } });
    if (!barcode) throw new NotFoundError("Barcode");

    // Allow deletion if:
    // 1. No product linked, OR
    // 2. Product is archived (active = 0)
    if (barcode.productId) {
      const product = await prisma.product.findUnique({ where: { id: barcode.productId } });
      if (product && product.active === 1) {
        throw new BadRequestError(
          "Cannot delete a barcode linked to an active product. Archive the product first."
        );
      }
    }

    await prisma.barcode.delete({ where: { id } });
    return { success: true };
  },

  async removeByProductId(productId: string) {
    // Delete all barcodes linked to a product (used when hard deleting a product)
    await prisma.barcode.deleteMany({ where: { productId } });
    return { success: true };
  },
};
