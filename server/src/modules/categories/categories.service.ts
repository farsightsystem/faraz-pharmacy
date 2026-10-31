import { prisma, Prisma } from "../../services/prisma";
import { NotFoundError } from "../../utils/errors";
import type { CreateCategoryInput } from "./categories.schema";

export const categoriesService = {
  async list({
    page = 1,
    limit = 50,
    search,
    includeArchived = false,
    archivedOnly = false,
    sortBy,
    sortOrder,
  }: {
    page?: number;
    limit?: number;
    search?: string;
    includeArchived?: boolean;
    archivedOnly?: boolean;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  } = {}) {
    const where: Prisma.CategoryWhereInput = archivedOnly
      ? { active: 0 }
      : includeArchived
      ? {}
      : { active: 1 };

    if (search) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
      ];
    }

    const skip = (page - 1) * limit;

    let orderBy: Prisma.CategoryOrderByWithRelationInput = { createdAt: sortOrder || "desc" };
    if (sortBy === "name") {
      orderBy = { name: sortOrder || "asc" };
    } else if (sortBy === "createdAt" || sortBy === "created_at") {
      orderBy = { createdAt: sortOrder || "desc" };
    }

    const [total, data] = await prisma.$transaction([
      prisma.category.count({ where }),
      prisma.category.findMany({
        where,
        orderBy,
        skip,
        take: limit,
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

  async create(data: CreateCategoryInput) {
    return prisma.category.create({
      data: { name: data.name },
    });
  },

  async update(id: string, data: CreateCategoryInput) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Category");
    return prisma.category.update({
      where: { id },
      data: { name: data.name },
    });
  },

  async remove(id: string) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Category");
    return prisma.category.update({
      where: { id },
      data: { active: 0 },
    });
  },

  async restore(id: string) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Category");
    return prisma.category.update({
      where: { id },
      data: { active: 1 },
    });
  },

  async hardDelete(id: string) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Category");
    await prisma.category.delete({ where: { id } });
    return { success: true };
  },
};
