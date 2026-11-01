import { api } from "@/lib/api";
import { db, isCacheStale } from "@/lib/localDb";
import type { Product, ProductPrice } from "@/types";

const CATALOG_SYNC_VERSION = "2";
const INCREMENTAL_SYNC_MINUTES = 30;
const FULL_SYNC_MINUTES = 24 * 60;
export const PRODUCT_CACHE_REFRESH_INTERVAL_MS = INCREMENTAL_SYNC_MINUTES * 60_000;

interface SyncOptions {
  full?: boolean;
  updatedSince?: string | null;
}

async function syncProducts({ full = false, updatedSince }: SyncOptions = {}): Promise<{
  synced: number;
  error: string | null;
}> {
  try {
    const result = await api.products.syncCatalog({
      updatedSince: full ? undefined : updatedSince ?? undefined,
    });
    const changedProducts = result.products.filter((product) => product.active === 1);
    const removedIds = result.products
      .filter((product) => product.active !== 1)
      .map((product) => product.id);
    const changedIds = changedProducts.map((product) => product.id);
    await db.transaction("rw", db.products, db.priceTiers, async () => {
      if (full) {
        await db.products.clear();
        await db.priceTiers.clear();
      } else {
        if (removedIds.length > 0) {
          await db.products.bulkDelete(removedIds);
          await db.priceTiers.where("productId").anyOf(removedIds).delete();
        }
        if (changedIds.length > 0) {
          await db.priceTiers.where("productId").anyOf(changedIds).delete();
        }
      }

      if (changedProducts.length > 0) {
        await db.products.bulkPut(changedProducts);
        const allTiers: ProductPrice[] = changedProducts.flatMap((product) =>
          (product.prices || []).map((tier) => ({ ...tier, productId: product.id }))
        );
        if (allTiers.length > 0) {
          await db.priceTiers.bulkPut(allTiers);
        }
      }
    });

    await db.syncMeta.put({ key: "last_sync", value: result.syncedAt });
    if (full) {
      await db.syncMeta.put({ key: "last_full_sync", value: result.syncedAt });
      await db.syncMeta.put({ key: "catalog_sync_version", value: CATALOG_SYNC_VERSION });
    }

    return { synced: changedProducts.length, error: null };
  } catch (err) {
    return {
      synced: 0,
      error: err instanceof Error ? err.message : "Unknown sync error",
    };
  }
}

/**
 * Ensure the local product cache is populated.
 * If cache is missing or stale, sync from server.
 * If server is unreachable, return whatever is in IndexedDB.
 */
export async function ensureProductCache(): Promise<{
  fromCache: boolean;
  count: number;
  error: string | null;
}> {
  const synchronizeIfStale = async () => {
    const [lastSync, lastFullSync, version, count] = await Promise.all([
      db.syncMeta.get("last_sync"),
      db.syncMeta.get("last_full_sync"),
      db.syncMeta.get("catalog_sync_version"),
      db.products.count(),
    ]);
    const needsFullSync =
      version?.value !== CATALOG_SYNC_VERSION ||
      count === 0 ||
      isCacheStale(lastFullSync?.value ?? null, FULL_SYNC_MINUTES);
    const needsIncrementalSync =
      !needsFullSync && isCacheStale(lastSync?.value ?? null, INCREMENTAL_SYNC_MINUTES);

    if (!needsFullSync && !needsIncrementalSync) {
      return { fromCache: true, count, error: null };
    }

    const result = await syncProducts({
      full: needsFullSync,
      updatedSince: lastSync?.value,
    });
    if (result.error) {
      return {
        fromCache: count > 0,
        count,
        error: result.error,
      };
    }
    return { fromCache: false, count: await db.products.count(), error: null };
  };

  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("faraz-product-catalog-sync", synchronizeIfStale);
  }
  return synchronizeIfStale();
}

export async function refreshProductCache(): Promise<{ error: string | null }> {
  const synchronize = async () => {
    const [lastSync, lastFullSync, version, count] = await Promise.all([
      db.syncMeta.get("last_sync"),
      db.syncMeta.get("last_full_sync"),
      db.syncMeta.get("catalog_sync_version"),
      db.products.count(),
    ]);
    const needsFullSync =
      version?.value !== CATALOG_SYNC_VERSION ||
      count === 0 ||
      isCacheStale(lastFullSync?.value ?? null, FULL_SYNC_MINUTES);
    const result = await syncProducts({
      full: needsFullSync,
      updatedSince: lastSync?.value,
    });
    return { error: result.error };
  };

  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("faraz-product-catalog-sync", synchronize);
  }
  return synchronize();
}

/**
 * Look up a product by barcode from the local IndexedDB cache.
 * Returns null if not found locally.
 */
export async function getProductByBarcodeLocal(barcode: string): Promise<Product | null> {
  const product = await db.products.where("barcode").equalsIgnoreCase(barcode).first();
  return product ?? null;
}

/**
 * Look up a product by ID from the local IndexedDB cache.
 */
export async function getProductByIdLocal(id: string): Promise<Product | null> {
  const product = await db.products.get(id);
  return product ?? null;
}

/**
 * Get all active products from local cache (for search dropdown).
 */
export async function getAllProductsLocal(): Promise<Product[]> {
  return db.products.where("active").equals(1).toArray();
}

/**
 * Queue a sale for offline sync when the server is back online.
 */
export async function queuePendingSale(saleData: any): Promise<void> {
  await db.pendingSales.add({
    ...saleData,
    created_at: new Date().toISOString(),
    synced: false,
  });
}

/**
 * Get all unsynced pending sales.
 */
export async function getPendingSales(): Promise<any[]> {
  return db.pendingSales.where("synced").equals(0).toArray();
}

/**
 * Mark a pending sale as synced.
 */
export async function markSaleSynced(id: number): Promise<void> {
  await db.pendingSales.delete(id);
}
