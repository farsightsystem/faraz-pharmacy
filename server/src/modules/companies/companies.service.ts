import { prisma, Prisma } from "../../services/prisma";
import { NotFoundError } from "../../utils/errors";
import type { CreateCompanyInput } from "./companies.schema";

const LOW_STOCK_THRESHOLD = 5;

type CompanyTotals = {
  product_count: number;
  total_stock: number;
  stock_value_purchase: number;
  stock_value_retail: number;
  in_stock_count: number;
  low_stock_count: number;
  out_of_stock_count: number;
  expired_count: number;
  expiring_30_count: number;
  expiring_90_count: number;
  no_expiry_count: number;
};

function emptyTotals(): CompanyTotals {
  return {
    product_count: 0,
    total_stock: 0,
    stock_value_purchase: 0,
    stock_value_retail: 0,
    in_stock_count: 0,
    low_stock_count: 0,
    out_of_stock_count: 0,
    expired_count: 0,
    expiring_30_count: 0,
    expiring_90_count: 0,
    no_expiry_count: 0,
  };
}

function daysUntilExpiry(expiry: string | null): number | null {
  if (!expiry) return null;

  const [year, month, day] = expiry.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.round((new Date(year, month - 1, day).getTime() - today.getTime()) / 86400000);
}

export const companiesService = {
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
    const where: Prisma.CompanyWhereInput = archivedOnly
      ? { active: 0 }
      : includeArchived
      ? {}
      : { active: 1 };

    if (search && search.trim()) {
      const q = search.trim();
      where.name = { contains: q, mode: "insensitive" };
    }

    const skip = (page - 1) * limit;

    let orderBy: Prisma.CompanyOrderByWithRelationInput = { createdAt: sortOrder || "desc" };
    if (sortBy === "name") {
      orderBy = { name: sortOrder || "asc" };
    } else if (sortBy === "createdAt" || sortBy === "created_at") {
      orderBy = { createdAt: sortOrder || "desc" };
    }

    const [total, data] = await prisma.$transaction([
      prisma.company.count({ where }),
      prisma.company.findMany({
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
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  },

  async getById(id: string) {
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        products: {
          orderBy: { name: "asc" },
        },
      },
    });
    if (!company) throw new NotFoundError("Company");

    const totalStock = company.products.reduce((sum, p) => sum + (p.stockQty ?? 0), 0);

    return {
      id: company.id,
      name: company.name,
      created_at: company.createdAt.toISOString(),
      product_count: company.products.length,
      total_stock: totalStock,
      products: company.products.map((p) => ({
        id: p.id,
        barcode: p.barcode,
        name: p.name,
        category: p.category,
        location: p.location,
        sale_price: p.salePrice,
        purchase_price: p.purchasePrice,
        stock_qty: p.stockQty,
        expiry: p.expiry ?? null,
        active: p.active,
        created_at: p.createdAt.toISOString(),
      })),
    };
  },

  async report({ search }: { search?: string } = {}) {
    const query = search?.trim();

    const [companies, products] = await Promise.all([
      prisma.company.findMany({
        where: query ? { name: { contains: query, mode: "insensitive" } } : undefined,
        orderBy: { name: "asc" },
        select: { id: true, name: true, createdAt: true },
      }),
      prisma.product.findMany({
        where: { companyId: { not: null }, active: 1 },
        select: {
          companyId: true,
          stockQty: true,
          purchasePrice: true,
          salePrice: true,
          expiry: true,
        },
      }),
    ]);

    const totalsByCompany = new Map<string, CompanyTotals>();

    for (const product of products) {
      if (!product.companyId) continue;

      let totals = totalsByCompany.get(product.companyId);
      if (!totals) {
        totals = emptyTotals();
        totalsByCompany.set(product.companyId, totals);
      }

      const stock = product.stockQty ?? 0;
      totals.product_count += 1;
      totals.total_stock += stock;
      totals.stock_value_purchase += stock * product.purchasePrice;
      totals.stock_value_retail += stock * product.salePrice;

      if (stock <= 0) totals.out_of_stock_count += 1;
      else if (stock <= LOW_STOCK_THRESHOLD) totals.low_stock_count += 1;
      else totals.in_stock_count += 1;

      const days = daysUntilExpiry(product.expiry);
      if (days === null) {
        totals.no_expiry_count += 1;
      } else if (stock > 0) {
        if (days <= 0) totals.expired_count += 1;
        if (days > 0 && days <= 30) totals.expiring_30_count += 1;
        if (days > 0 && days <= 90) totals.expiring_90_count += 1;
      }
    }

    const rows = companies.map((company) => ({
      id: company.id,
      name: company.name,
      created_at: company.createdAt.toISOString(),
      ...(totalsByCompany.get(company.id) ?? emptyTotals()),
    }));

    const totals = rows.reduce((sum, row) => {
      for (const key of Object.keys(sum) as (keyof CompanyTotals)[]) {
        sum[key] += row[key];
      }
      return sum;
    }, emptyTotals());

    return {
      data: rows,
      totals,
      low_stock_threshold: LOW_STOCK_THRESHOLD,
    };
  },

  async create(data: CreateCompanyInput) {
    return prisma.company.create({
      data: { name: data.name },
    });
  },

  async update(id: string, data: CreateCompanyInput) {
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Company");
    return prisma.company.update({
      where: { id },
      data: { name: data.name },
    });
  },

  async remove(id: string) {
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Company");
    return prisma.company.update({
      where: { id },
      data: { active: 0 },
    });
  },

  async restore(id: string) {
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Company");
    return prisma.company.update({
      where: { id },
      data: { active: 1 },
    });
  },

  async hardDelete(id: string) {
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Company");
    await prisma.product.updateMany({
      where: { companyId: id },
      data: { companyId: null },
    });
    await prisma.company.delete({ where: { id } });
    return { success: true };
  },
};
