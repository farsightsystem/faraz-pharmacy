import { prisma, Prisma } from "../../services/prisma";
import { NotFoundError } from "../../utils/errors";
import type { CreateDistributorInput, UpdateDistributorInput } from "./suppliers.schema";
import { clampPageSize } from "../../utils/pagination";

export const suppliersService = {
  async list({
    page = 1,
    limit = 200,
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
    limit = clampPageSize(limit);
    const where: Prisma.DistributorWhereInput = archivedOnly
      ? { active: 0 }
      : includeArchived
      ? {}
      : { active: 1 };

    if (search) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { salesmanName: { contains: q, mode: "insensitive" } },
        { salesmanContact: { contains: q, mode: "insensitive" } },
        { deliveryManName: { contains: q, mode: "insensitive" } },
        { deliveryManContact: { contains: q, mode: "insensitive" } },
      ];
    }

    const skip = (page - 1) * limit;

    let orderBy: Prisma.DistributorOrderByWithRelationInput = { createdAt: sortOrder || "desc" };
    if (sortBy === "name") {
      orderBy = { name: sortOrder || "asc" };
    } else if (sortBy === "salesmanName") {
      orderBy = { salesmanName: sortOrder || "asc" };
    } else if (sortBy === "deliveryManName") {
      orderBy = { deliveryManName: sortOrder || "asc" };
    } else if (sortBy === "createdAt" || sortBy === "created_at") {
      orderBy = { createdAt: sortOrder || "desc" };
    }

    const [total, data] = await Promise.all([
      prisma.distributor.count({ where }),
      prisma.distributor.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          _count: { select: { products: true } },
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

  async create(data: CreateDistributorInput) {
    return prisma.distributor.create({
      data: {
        name: data.name ?? "",
        salesmanName: data.salesmanName ?? "",
        salesmanContact: data.salesmanContact ?? "",
        deliveryManName: data.deliveryManName ?? "",
        deliveryManContact: data.deliveryManContact ?? "",
      },
    });
  },

  async update(id: string, data: UpdateDistributorInput) {
    const existing = await prisma.distributor.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Distributor");
    // Partial update: only set fields that were actually provided
    const patch: Partial<Record<"name" | "salesmanName" | "salesmanContact" | "deliveryManName" | "deliveryManContact", string>> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.salesmanName !== undefined) patch.salesmanName = data.salesmanName;
    if (data.salesmanContact !== undefined) patch.salesmanContact = data.salesmanContact;
    if (data.deliveryManName !== undefined) patch.deliveryManName = data.deliveryManName;
    if (data.deliveryManContact !== undefined) patch.deliveryManContact = data.deliveryManContact;
    return prisma.distributor.update({
      where: { id },
      data: patch,
    });
  },

  async remove(id: string) {
    const existing = await prisma.distributor.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Distributor");
    return prisma.distributor.update({
      where: { id },
      data: { active: 0 },
    });
  },

  async restore(id: string) {
    const existing = await prisma.distributor.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Distributor");
    return prisma.distributor.update({
      where: { id },
      data: { active: 1 },
    });
  },

  async hardDelete(id: string) {
    const existing = await prisma.distributor.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Distributor");

    await prisma.$transaction(async (tx) => {
      await tx.product.updateMany({
        where: { distributorId: id },
        data: { distributorId: null },
      });
      await tx.stockPurchase.updateMany({
        where: { distributorId: id },
        data: { distributorId: null },
      });
      await tx.productBatch.updateMany({
        where: { distributorId: id },
        data: { distributorId: null },
      });
      await tx.distributor.delete({ where: { id } });
    });

    return { success: true };
  },
};
