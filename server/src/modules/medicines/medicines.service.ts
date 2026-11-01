import { prisma } from "../../services/prisma";
import { NotFoundError } from "../../utils/errors";
import { emitEvent } from "../../socket";
import { clampPageSize } from "../../utils/pagination";
import type { CreateProductInput } from "./medicines.schema";

function formatProduct(p: any) {
  if (!p) return p;
  return {
    ...p,
    company: p.company?.name || "",
  };
}

function resolveSalePrice(
  purchasePrice: number,
  salePrice: number | undefined,
  markupPercent: number
) {
  if (salePrice && salePrice > 0) return salePrice;
  return Math.max(
    purchasePrice + 0.01,
    Math.round(purchasePrice * (1 + markupPercent / 100))
  );
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
  }) {
    limit = clampPageSize(limit);

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

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          prices: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
          company: true,
        },
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

    return result;
  },

  async search(query: string) {
    const q = `%${query}%`;
    return prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT products.*, companies.name as company FROM products LEFT JOIN companies ON products.company_id = companies.id WHERE products.active = 1 AND (products.barcode ILIKE $1 OR products.name ILIKE $1 OR companies.name ILIKE $1) ORDER BY products.name ASC LIMIT 50`,
      q
    );
  },

  async getByBarcode(barcode: string) {
    const trimmed = barcode.trim();
    const product = await prisma.product.findFirst({
      where: {
        active: 1,
        barcode: { equals: trimmed, mode: "insensitive" },
      },
      include: { prices: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    });
    return formatProduct(product);
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
        prices: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            productId: true,
            label: true,
            purchasePrice: true,
            salePrice: true,
          },
        },
      },
    });
  },

  async getById(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { prices: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    });
    if (!product) throw new NotFoundError("Product");
    return formatProduct(product);
  },

  async create(data: CreateProductInput) {
    const markupPercent = data.markupPercent ?? 20;
    const salePrice = resolveSalePrice(data.purchasePrice, data.salePrice, markupPercent);

    const pricesData =
      data.prices && data.prices.length > 0
        ? data.prices.map((p) => ({
            label: p.label ?? "Standard",
            purchasePrice: p.purchasePrice,
            salePrice: resolveSalePrice(p.purchasePrice, p.salePrice, markupPercent),
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
        expiry: data.expiry ?? null,
        ...(pricesData.length > 0 ? { prices: { createMany: { data: pricesData } } } : {}),
        barcodeLink: {
          connectOrCreate: {
            where: { code: data.barcode },
            create: { code: data.barcode },
          },
        },
      },
      include: {
        prices: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        company: true,
      },
    });
    emitEvent("inventory:updated", null);
    return formatProduct(product);
  },

  async update(id: string, data: CreateProductInput) {
    const old = await prisma.product.findUnique({ where: { id } });
    if (!old) throw new NotFoundError("Product");

    const markupPercent = data.markupPercent ?? old.markupPercent;
    const salePrice = resolveSalePrice(data.purchasePrice, data.salePrice, markupPercent);

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
      markupPercent,
    };

    updateData.barcodeLink = {
      connectOrCreate: {
        where: { code: data.barcode },
        create: { code: data.barcode },
      },
    };

    const product = await prisma.$transaction(async (tx) => {
      if (data.prices !== undefined) {
        const existingPrices = await tx.productPrice.findMany({
          where: { productId: id },
          select: { id: true },
        });
        const existingPriceIds = existingPrices.map((price) => price.id);
        if (existingPriceIds.length > 0) {
          await tx.stockPurchase.updateMany({
            where: { priceTierId: { in: existingPriceIds } },
            data: { priceTierId: null },
          });
        }
        await tx.productPrice.deleteMany({ where: { productId: id } });
        if (data.prices.length > 0) {
          await tx.productPrice.createMany({
            data: data.prices.map((price) => ({
              productId: id,
              label: price.label ?? "Standard",
              purchasePrice: price.purchasePrice,
              salePrice: resolveSalePrice(price.purchasePrice, price.salePrice, markupPercent),
            })),
          });
        }
      }

      return tx.product.update({
        where: { id },
        data: updateData as any,
        include: {
          prices: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
          company: true,
        },
      });
    });
    emitEvent("inventory:updated", null);
    return formatProduct(product);
  },

  async archive(id: string) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundError("Product");
    const result = await prisma.product.update({ where: { id }, data: { active: 0 } });
    emitEvent("inventory:updated", null);
    return result;
  },

  async restore(id: string) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundError("Product");
    const result = await prisma.product.update({ where: { id }, data: { active: 1 } });
    emitEvent("inventory:updated", null);
    return result;
  },

  async hardDelete(id: string) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundError("Product");

    await prisma.$transaction(async (tx) => {
      await tx.barcode.deleteMany({ where: { productId: id } });
      await tx.productPrice.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
    });

    emitEvent("inventory:updated", null);
    return { success: true };
  },
};
