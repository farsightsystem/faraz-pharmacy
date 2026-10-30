import { prisma } from "../../services/prisma";
import { NotFoundError } from "../../utils/errors";
import { cacheGet, cacheSet, cacheDelNamespace, makeKey } from "../../utils/cache";
import type { CreateProductInput } from "./medicines.schema";

function formatProduct(p: any) {
  if (!p) return p;
  return {
    ...p,
    company: p.company?.name || "",
  };
}

// The product form picks from the company list, so this only ever resolves an
// existing company. It used to create one on the fly, which let a typo silently
// add a new manufacturer to the company module.
async function resolveCompanyId(company?: string): Promise<string | null> {
  const name = company?.trim();
  if (!name) return null;

  const existing = await prisma.company.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });

  return existing?.id ?? null;
}

export const medicinesService = {
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
  }) {
    const cacheKey = makeKey("products:list", {
      page, limit, search, includeArchived, archivedOnly, sortBy, sortOrder,
    });
    const cached = cacheGet<{ data: any[]; meta: any }>(cacheKey);
    if (cached) return cached;

    const where: any = archivedOnly ? { active: 0 } : includeArchived ? {} : { active: 1 };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { barcode: { contains: search, mode: "insensitive" } },
        { category: { contains: search, mode: "insensitive" } },
        { company: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const skip = (page - 1) * limit;

    let orderBy: Record<string, "asc" | "desc"> = { createdAt: sortOrder || "desc" };
    if (sortBy === "name") {
      orderBy = { name: sortOrder || "asc" };
    } else if (sortBy === "salePrice" || sortBy === "sale_price") {
      orderBy = { salePrice: sortOrder || "desc" };
    } else if (sortBy === "purchasePrice" || sortBy === "purchase_price") {
      orderBy = { purchasePrice: sortOrder || "desc" };
    } else if (sortBy === "stockQty" || sortBy === "stock_qty") {
      orderBy = { stockQty: sortOrder || "desc" };
    } else if (sortBy === "createdAt" || sortBy === "created_at") {
      orderBy = { createdAt: sortOrder || "desc" };
    }

    const [total, products] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: { prices: true, company: true },
      }),
    ]);

    const result = {
      data: products.map(formatProduct),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    cacheSet(cacheKey, result, 60); // cache for 60 seconds
    return result;
  },

  async search(query: string) {
    const cacheKey = makeKey("products:search", { q: query.trim() });
    const cached = cacheGet<any[]>(cacheKey);
    if (cached) return cached;

    const q = `%${query}%`;
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT products.*, companies.name as company FROM products LEFT JOIN companies ON products.company_id = companies.id WHERE products.active = 1 AND (products.barcode ILIKE $1 OR products.name ILIKE $1 OR companies.name ILIKE $1) ORDER BY products.name ASC LIMIT 50`,
      q
    );
    cacheSet(cacheKey, rows, 30); // cache search results for 30 seconds
    return rows;
  },

  async getByBarcode(barcode: string) {
    const trimmed = barcode.trim();
    const cacheKey = makeKey("products:barcode", { barcode: trimmed.toLowerCase() });
    const cached = cacheGet<any>(cacheKey);
    if (cached) return cached;

    const product = await prisma.product.findFirst({
      where: {
        active: 1,
        barcode: { equals: trimmed, mode: "insensitive" },
      },
      include: { prices: true },
    });
    const formatted = formatProduct(product);
    cacheSet(cacheKey, formatted, 60); // cache barcode lookup for 60 seconds
    return formatted;
  },

  /**
   * Fast barcode lookup for POS scanning.
   * Returns only the fields needed at checkout to keep the JSON payload tiny.
   */
  async getByBarcodeFast(barcode: string) {
    const trimmed = barcode.trim();
    return prisma.product.findFirst({
      where: {
        active: 1,
        barcode: { equals: trimmed, mode: "insensitive" },
      },
      select: {
        id: true,
        barcode: true,
        name: true,
        salePrice: true,
        purchasePrice: true,
        stockQty: true,
        category: true,
        location: true,
        active: true,
        company: {
          select: { name: true },
        },
      },
    });
  },

  async getById(id: string) {
    const cacheKey = makeKey("products:id", { id });
    const cached = cacheGet<any>(cacheKey);
    if (cached) return cached;

    const product = await prisma.product.findUnique({
      where: { id },
      include: { prices: true },
    });
    if (!product) throw new NotFoundError("Product");
    const formatted = formatProduct(product);
    cacheSet(cacheKey, formatted, 60); // cache product lookup for 60 seconds
    return formatted;
  },

  async create(data: CreateProductInput) {
    const salePrice =
      data.salePrice && data.salePrice > 0
        ? data.salePrice
        : Math.round(data.purchasePrice * (1 + (data.markupPercent ?? 20) / 100));

    const pricesData =
      data.prices && data.prices.length > 0
        ? data.prices.map((p) => ({
            label: p.label ?? "Standard",
            purchasePrice: p.purchasePrice,
            salePrice:
              p.salePrice && p.salePrice > 0
                ? p.salePrice
                : Math.round(p.purchasePrice * (1 + (data.markupPercent ?? 20) / 100)),
          }))
        : [];

    const companyId = await resolveCompanyId(data.company);

    const product = await prisma.product.create({
      data: {
        barcode: data.barcode,
        name: data.name,
        companyId,
        category: data.category ?? "",
        location: data.location ?? "",
        distributorId: data.distributorId ?? null,
        salePrice,
        purchasePrice: data.purchasePrice,
        markupPercent: data.markupPercent ?? 20,
        stockQty: data.stockQty ?? 0,
        expiry: data.expiry ?? null,
        prices: { createMany: { data: pricesData } },
        barcodeLink: {
          connectOrCreate: {
            where: { code: data.barcode },
            create: { code: data.barcode },
          },
        },
      },
      include: { prices: true, company: true },
    });
    cacheDelNamespace("products"); // invalidate product cache on write
    return formatProduct(product);
  },

  async update(id: string, data: CreateProductInput) {
    const old = await prisma.product.findUnique({ where: { id } });
    if (!old) throw new NotFoundError("Product");

    const salePrice =
      data.salePrice && data.salePrice > 0
        ? data.salePrice
        : Math.round(data.purchasePrice * (1 + (data.markupPercent ?? old.markupPercent) / 100));

    const companyId = await resolveCompanyId(data.company);

    const updateData: Record<string, unknown> = {
      barcode: data.barcode,
      name: data.name,
      companyId,
      category: data.category ?? "",
      location: data.location ?? "",
      distributorId: data.distributorId ?? null,
      salePrice,
      purchasePrice: data.purchasePrice,
      markupPercent: data.markupPercent ?? old.markupPercent,
      stockQty: data.stockQty ?? 0,
      expiry: data.expiry ?? null,
    };

    if (data.prices) {
      const pricesData = data.prices.map((p) => ({
        label: p.label ?? "Standard",
        purchasePrice: p.purchasePrice,
        salePrice:
          p.salePrice && p.salePrice > 0
            ? p.salePrice
            : Math.round(p.purchasePrice * (1 + (data.markupPercent ?? old.markupPercent) / 100)),
      }));

      await prisma.productPrice.deleteMany({ where: { productId: id } });
      updateData.prices = { createMany: { data: pricesData } };
    }

    updateData.barcodeLink = {
      connectOrCreate: {
        where: { code: data.barcode },
        create: { code: data.barcode },
      },
    };

    const product = await prisma.product.update({
      where: { id },
      data: updateData as any,
      include: { prices: true, company: true },
    });
    cacheDelNamespace("products"); // invalidate product cache on write
    return formatProduct(product);
  },

  async archive(id: string) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundError("Product");
    const result = await prisma.product.update({ where: { id }, data: { active: 0 } });
    cacheDelNamespace("products"); // invalidate product cache on write
    return result;
  },

  async restore(id: string) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundError("Product");
    const result = await prisma.product.update({ where: { id }, data: { active: 1 } });
    cacheDelNamespace("products"); // invalidate product cache on write
    return result;
  },

  async hardDelete(id: string) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundError("Product");

    // Delete linked barcodes first
    await prisma.barcode.deleteMany({ where: { productId: id } });

    // Delete price tiers
    await prisma.productPrice.deleteMany({ where: { productId: id } });

    // Delete the product
    await prisma.product.delete({ where: { id } });

    cacheDelNamespace("products"); // invalidate product cache on write
    return { success: true };
  },
};
