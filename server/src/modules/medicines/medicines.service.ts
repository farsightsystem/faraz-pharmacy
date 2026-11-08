import { prisma } from "../../services/prisma";
import { BadRequestError, NotFoundError } from "../../utils/errors";
import { emitEvent } from "../../socket";
import { clampPageSize } from "../../utils/pagination";
import { cacheGet, cacheSet, cacheDelNamespace } from "../../utils/cache";
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

type BarcodeFastResult = {
  id: string;
  barcode: string;
  name: string;
  salePrice: number;
  purchasePrice: number;
  stockQty: number;
  category: string;
  location: string;
  active: number;
  company: { name: string } | null;
  prices: {
    id: string;
    productId: string;
    label: string;
    purchasePrice: number;
    salePrice: number;
  }[];
} | null;

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
          prices: {
            where: { active: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
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
      include: {
        prices: {
          where: { active: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });
    return formatProduct(product);
  },

  /**
   * Fast barcode lookup for POS scanning.
   * Returns only the fields needed at checkout to keep the JSON payload tiny.
   *
   * Cached with a deliberately SHORT TTL (10s): this dedupes rapid re-scans of
   * the same barcode but bounds staleness of stockQty. Any product or stock
   * write flushes the "products" namespace, so the cache is empty for the
   * rest of the 10s window after any change.
   */
  async getByBarcodeFast(barcode: string): Promise<BarcodeFastResult> {
    const trimmed = barcode.trim();
    if (!trimmed) return null;
    const cacheKey = `fz:products:bcfast:${trimmed.toLowerCase()}`;
    const cached = cacheGet<Exclude<BarcodeFastResult, null>>(cacheKey);
    if (cached !== undefined) return cached;

    const product = await prisma.product.findFirst({
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
          where: { active: true },
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
    cacheSet(cacheKey, product ?? null, 10); // 10s TTL — short on purpose (stock freshness)
    return product;
  },

  async getById(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        prices: {
          where: { active: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
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
        prices: {
          where: { active: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
        company: true,
      },
    });
    cacheDelNamespace("products"); // invalidate product cache on write
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
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
      const existingPrices = await tx.productPrice.findMany({
        where: { productId: id, active: true },
        select: { id: true, purchasePrice: true, salePrice: true },
      });

      for (const price of existingPrices) {
        const matchingTiers = existingPrices.filter(
          (candidate) =>
            candidate.purchasePrice === price.purchasePrice &&
            candidate.salePrice === price.salePrice
        );
        if (
          matchingTiers.length === 1 &&
          (price.purchasePrice !== old.purchasePrice || price.salePrice !== old.salePrice)
        ) {
          await tx.$executeRaw`
            UPDATE stock_purchases
            SET price_tier_id = ${price.id}
            WHERE product_id = ${id}
              AND price_tier_id IS NULL
              AND purchase_price = ${price.purchasePrice}
              AND sale_price = ${price.salePrice}
          `;
        }
      }

      const existingPriceIds = new Set(existingPrices.map((price) => price.id));
      const correctedPrices = new Map<string, { purchasePrice: number; salePrice: number }>();
      const standardPrice = { purchasePrice: data.purchasePrice, salePrice };
      correctedPrices.set("", standardPrice);

      await tx.$executeRaw`
        UPDATE stock_purchases
        SET purchase_price = ${standardPrice.purchasePrice},
            sale_price = ${standardPrice.salePrice},
            total_value = quantity * ${standardPrice.purchasePrice}
        WHERE product_id = ${id}
          AND price_tier_id IS NULL
          AND purchase_price = ${old.purchasePrice}
          AND sale_price = ${old.salePrice}
          AND NOT EXISTS (
            SELECT 1
            FROM product_prices pp
            WHERE pp.product_id = stock_purchases.product_id
              AND pp.active = true
              AND pp.purchase_price = stock_purchases.purchase_price
              AND pp.sale_price = stock_purchases.sale_price
          )
      `;

      if (data.prices !== undefined) {
        const incomingIds = data.prices.flatMap((price) => (price.id ? [price.id] : []));
        if (new Set(incomingIds).size !== incomingIds.length) {
          throw new BadRequestError("A price tier cannot be included more than once");
        }
        if (incomingIds.some((priceId) => !existingPriceIds.has(priceId))) {
          throw new BadRequestError("The selected price tier does not belong to this product");
        }

        for (const price of data.prices) {
          const nextPrice = {
            purchasePrice: price.purchasePrice,
            salePrice: resolveSalePrice(price.purchasePrice, price.salePrice, markupPercent),
          };
          if (price.id) {
            await tx.productPrice.update({
              where: { id: price.id },
              data: {
                label: price.label ?? "Standard",
                ...nextPrice,
              },
            });
            correctedPrices.set(price.id, nextPrice);
            await tx.$executeRaw`
              UPDATE stock_purchases
              SET purchase_price = ${nextPrice.purchasePrice},
                  sale_price = ${nextPrice.salePrice},
                  total_value = quantity * ${nextPrice.purchasePrice}
              WHERE product_id = ${id}
                AND price_tier_id = ${price.id}
            `;
          } else {
            await tx.productPrice.create({
              data: {
                productId: id,
                label: price.label ?? "Standard",
                ...nextPrice,
              },
            });
          }
        }

        const removedPriceIds = [...existingPriceIds].filter(
          (priceId) => !incomingIds.includes(priceId)
        );
        if (removedPriceIds.length > 0) {
          await tx.productPrice.updateMany({
            where: { id: { in: removedPriceIds }, productId: id },
            data: { active: false },
          });
        }
      }

      const batchPriceSources = await tx.stockPurchase.groupBy({
        by: ["batchId", "priceTierId"],
        where: { productId: id, active: 1, batchId: { not: null } },
      });
      const sourcesByBatch = new Map<string, Set<string>>();
      for (const source of batchPriceSources) {
        if (!source.batchId) continue;
        const sources = sourcesByBatch.get(source.batchId) ?? new Set<string>();
        sources.add(source.priceTierId ?? "");
        sourcesByBatch.set(source.batchId, sources);
      }

      const batchesBySource = new Map<string, string[]>();
      for (const [batchId, sources] of sourcesByBatch) {
        if (sources.size !== 1) continue;
        const [sourceId] = sources;
        if (sourceId === undefined || !correctedPrices.has(sourceId)) continue;
        const batchIds = batchesBySource.get(sourceId) ?? [];
        batchIds.push(batchId);
        batchesBySource.set(sourceId, batchIds);
      }

      for (const [sourceId, batchIds] of batchesBySource) {
        const correctedPrice = correctedPrices.get(sourceId);
        if (!correctedPrice) continue;
        await tx.productBatch.updateMany({
          where: { id: { in: batchIds } },
          data: correctedPrice,
        });
      }

      return tx.product.update({
        where: { id },
        data: updateData as any,
        include: {
          prices: {
            where: { active: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
          company: true,
        },
      });
    });
    cacheDelNamespace("products"); // invalidate product cache on write
    emitEvent("inventory:updated", null);
    return formatProduct(product);
  },

  async archive(id: string) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundError("Product");
    const result = await prisma.product.update({ where: { id }, data: { active: 0 } });
    cacheDelNamespace("products"); // invalidate product cache on write
    emitEvent("inventory:updated", null);
    return result;
  },

  async restore(id: string) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundError("Product");
    const result = await prisma.product.update({ where: { id }, data: { active: 1 } });
    cacheDelNamespace("products"); // invalidate product cache on write
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

    cacheDelNamespace("products"); // invalidate product cache on write
    emitEvent("inventory:updated", null);
    return { success: true };
  },
};
