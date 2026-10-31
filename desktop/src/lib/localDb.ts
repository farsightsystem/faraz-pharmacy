import Dexie, { type Table } from "dexie";
import type { Product, ProductPrice, Customer, ProductBatch } from "@/types";

/**
 * Local IndexedDB database for offline-first product lookups.
 *
 * This is a read-cache of the server's product catalog. On app boot,
 * the sync routine fetches active products + price tiers from the server
 * and writes them here. Barcode scans then query IndexedDB first (~1ms)
 * instead of making a round-trip to the server over LAN.
 *
 * Writes (sales, stock purchases) still go to the server via REST/Socket.io.
 * When offline, sales are queued locally and synced when the server is back.
 */
export class PharmacyDb extends Dexie {
  products!: Table<Product, string>;
  priceTiers!: Table<ProductPrice, string>;
  customers!: Table<Customer, string>;
  productBatches!: Table<ProductBatch, string>;
  pendingSales!: Table<any, number>;
  syncMeta!: Table<{ key: string; value: string }, string>;

  constructor() {
    super("PharmacyDB");
    this.version(1).stores({
      products: "id, barcode, name, sale_price, purchase_price, stock_qty, active, updated_at",
      priceTiers: "id, productId, label",
      customers: "id, name, phone, active",
      productBatches: "id, productId, batch_number, expiry_date, active",
      pendingSales: "++id, created_at, synced",
      syncMeta: "key",
    });
  }
}

export const db = new PharmacyDb();

/**
 * Get the last successful sync timestamp from IndexedDB.
 */
export async function getLastSync(): Promise<string | null> {
  const row = await db.syncMeta.get("last_sync");
  return row ? row.value : null;
}

/**
 * Set the last successful sync timestamp.
 */
export async function setLastSync(timestamp: string): Promise<void> {
  await db.syncMeta.put({ key: "last_sync", value: timestamp });
}

/**
 * Check if the local cache is stale (older than maxAgeMinutes).
 * Returns true if no sync has ever happened or cache is too old.
 */
export function isCacheStale(lastSync: string | null, maxAgeMinutes = 30): boolean {
  if (!lastSync) return true;
  const last = new Date(lastSync).getTime();
  const now = Date.now();
  const ageMinutes = (now - last) / (1000 * 60);
  return ageMinutes > maxAgeMinutes;
}
