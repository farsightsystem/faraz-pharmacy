import NodeCache from "node-cache";

/**
 * Application-wide cache singleton using node-cache.
 *
 * Provides a simple key-value store with TTL-based expiration.
 * Used to cache frequently-read, slowly-changing data (product catalog,
 * customer list, barcode lookups) to reduce PostgreSQL load on the LAN server.
 */
const cache = new NodeCache({
  stdTTL: 60,        // default TTL: 60 seconds
  checkperiod: 120,  // check for expired keys every 120 seconds
  useClones: false,  // don't clone objects on get (faster, safe for read-only)
});

/**
 * Generate a deterministic cache key from a namespace and optional params.
 */
export function makeKey(namespace: string, params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) {
    return `fz:${namespace}`;
  }
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return `fz:${namespace}:${sorted}`;
}

/**
 * Get a value from cache. Returns undefined if missing or expired.
 */
export function cacheGet<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

/**
 * Set a value in cache with an optional custom TTL (seconds).
 */
export function cacheSet<T>(key: string, value: T, ttl?: number): boolean {
  if (ttl !== undefined) {
    return cache.set(key, value, ttl);
  }
  return cache.set(key, value);
}

/**
 * Delete a specific key from cache.
 */
export function cacheDel(key: string): number {
  return cache.del(key);
}

/**
 * Delete all keys matching a namespace prefix.
 */
export function cacheDelNamespace(namespace: string): number {
  const keys = cache.keys().filter((k) => k.startsWith(`fz:${namespace}`));
  if (keys.length === 0) return 0;
  return cache.del(keys);
}

/**
 * Flush the entire cache. Use with care.
 */
export function cacheFlush(): void {
  cache.flushAll();
}

/**
 * Get cache statistics (useful for debugging/monitoring).
 */
export function cacheStats() {
  return cache.getStats();
}
