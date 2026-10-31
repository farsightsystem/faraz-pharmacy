import { api } from "@/lib/api";
import { db, setLastSync, getLastSync, isCacheStale } from "@/lib/localDb";
import type { Product, ProductPrice } from "@/types";

/**
 * Sync service for offline-first product cache.
 *
 * On app boot, fetches the active product catalog from the server and
 * writes it to IndexedDB. Subsequent barcode scans query IndexedDB first.
 *
 * Sync strategy:
 * - Full product list fetch on boot (or when cache is stale)
 * - Products stored with their price tiers
 * - last_sync timestamp tracked to detect staleness
 */

/**
 * Sync active products from the server to IndexedDB.
 * Returns the number of products synced.
 */
export async function syncProducts(): Promise<{
  synced: number;
  error: string | null;
}> {
  try {
    // Fetch all active products (no pagination limit - get everything)
    const products = await api.products.listPaginated({
      page: 1,
      limit: 10000,
      includeArchived: false,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    const productList: Product[] = products.data || [];

    // Clear existing products and write fresh
    await db.transaction("rw", db.products, db.priceTiers, async () => {
      await db.products.clear();
      await db.priceTiers.clear();

      // Batch insert products
      if (productList.length > 0) {
        await db.products.bulkAdd(
          productList.map((p) => ({
            ...p,
            updated_at: new Date().toISOString(),
          }))
        );

        // Batch insert price tiers
        const allTiers: ProductPrice[] = productList.flatMap((p) =>
          (p.prices || []).map((tier) => ({
            ...tier,
            productId: p.id,
          }))
        );
        if (allTiers.length > 0) {
          await db.priceTiers.bulkAdd(allTiers);
        }
      }
    });

    await setLastSync(new Date().toISOString());

    return { synced: productList.length, error: null };
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
  const lastSync = await getLastSync();
  const stale = isCacheStale(lastSync, 30);

  if (!stale) {
    const count = await db.products.count();
    return { fromCache: true, count, error: null };
  }

  // Try to sync from server
  const result = await syncProducts();
  if (result.error) {
    // Server unreachable - fall back to whatever is in IndexedDB
    const count = await db.products.count();
    if (count > 0) {
      return { fromCache: true, count, error: null };
    }
    return { fromCache: false, count: 0, error: result.error };
  }

  return { fromCache: false, count: result.synced, error: null };
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
