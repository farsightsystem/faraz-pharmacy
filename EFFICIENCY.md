# EFFICIENCY.md — Performance & Architecture Recommendations

**Project:** Faraz Pharmacy (Desktop POS)  
**Stack:** Electron + React (Vite) · Express.js · Prisma ORM · PostgreSQL · PM2 (Windows LAN)  
**Date:** October 2026  
**Author:** Engineering Review

---

## 1. Executive Summary

The Faraz Pharmacy desktop POS runs on a local area network (LAN) where multiple client computers connect to a single server PC over static Ethernet IPs. The application is **offline-capable by design** (no internet dependency), but every barcode scan, product search, and stock lookup currently makes a full HTTP/REST round-trip to the server.

This document outlines the concrete, prioritized actions to improve speed, reduce server load, eliminate database blocking, and make the cashier UI feel instantaneous — without abandoning PostgreSQL or introducing unnecessary architectural complexity.

---

## 2. Guiding Principles

| Principle | Application to This Project |
|-----------|----------------------------|
| **PostgreSQL stays** | The server PC remains the source of truth with all relational integrity. No migration to SQLite or file-based storage. |
| **Fastest request is no request** | Cache product catalog on clients (IndexedDB) so barcode scans resolve locally (~1 ms) instead of over LAN. |
| **Reuse, don't recreate** | Single PrismaClient singleton; persistent HTTP connections; pooled database connections. |
| **Index before you scale** | Add PostgreSQL indexes now while tables are small; sequential scans become painful as sales history grows. |
| **Socket.io for high frequency** | Use the already-initialized Socket.io server for barcode scans and stock checks, not REST. |

---

## 3. Immediate Actions (Do This Week)

These changes require minimal code, zero client-side disruption, and deliver measurable speed improvements.

### 3.1 Enforce PrismaClient Singleton

**Risk:** If `new PrismaClient()` is instantiated inside route handlers or service files on every request, each Express handler opens a new connection pool. Under PM2 with multiple instances, PostgreSQL connection slots exhaust and the server crashes or hangs.

**File:** `server/src/services/prisma.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

**Action:** Audit `server/src/modules/*/*.service.ts` and controllers. Ensure they import `prisma` from `services/prisma.ts` and never call `new PrismaClient()` locally.

---

### 3.2 Add PostgreSQL Indexes (Critical)

Without indexes, `WHERE barcode = '...'` triggers a sequential scan over the entire `products` table. As sales history grows, every scan slows down.

**File:** `server/prisma/schema.prisma`

Add `@index()` to frequently queried columns:

```prisma
model Product {
  id            String   @id @default(uuid())
  barcode       String   @unique        // Already indexed via @unique
  name          String   @index()       // ADD
  location      String   @index()       // ADD (rack/shelf searches)
  active        Int      @default(1)
  companyId     String?  @map("company_id")
  distributorId String?  @map("distributor_id")
  // ... other fields
}

model StockPurchase {
  id            String       @id @default(uuid())
  productId     String       @map("product_id")   @index() // ADD
  createdAt     DateTime     @default(now())     @map("created_at") @index() // ADD
  invoiceNumber String       @default("")         @map("invoice_number") @index() // ADD
  active        Int           @default(1)
  // ... other fields
}

model ProductBatch {
  productId     String   @map("product_id") @index() // ADD
  batchNumber   String   @map("batch_number")
  expiryDate    String   @map("expiry_date") @index() // ADD (FEFO expiry queries)
  active        Int      @default(1)
}
```

**Command:** `cd server && npx prisma migrate dev --name add_performance_indexes && npx prisma generate`

---

### 3.3 Targeted `select` for Barcode Lookup

The barcode scan endpoint should return only the fields the POS needs, not the full 30+ column Product object.

**Optimized query pattern:**

```typescript
// products.service.ts or controller
const item = await prisma.product.findUnique({
  where: { barcode: scannedBarcode },
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
  },
});
```

**Action:** Create a dedicated "fast path" endpoint or Socket.io event for barcode scans that uses this narrow `select`. Do not reuse the full `Product` type for the hot path.

---

### 3.4 Enable Express Compression

Product catalogs and reports can be large JSON payloads. Compression reduces LAN transmission time even on Ethernet.

**File:** `server/src/app.ts` (or wherever Express app is configured)

```typescript
import compression from 'compression';

app.use(compression()); // Add early in middleware stack
```

**Command:** `npm install compression`

---

### 3.5 Socket.io for Barcode Scanning (High Frequency Operations)

Standard HTTP/REST incurs connection overhead for every barcode scanned. Socket.io maintains an open TCP pipe, removing HTTP handshake latency on every scan.

**Server:** `server/src/socket/index.ts`

Added a `product:scan` Socket.io event handler that performs the same narrow `select` as the `/barcode-fast` REST endpoint, but over WebSocket. The client emits `{ barcode }` and receives the product via callback.

```typescript
socket.on("product:scan", async (data, callback) => {
  const product = await prisma.product.findFirst({
    where: { active: 1, barcode: { equals: data.barcode.trim(), mode: "insensitive" } },
    select: {
      id: true, barcode: true, name: true, salePrice: true,
      purchasePrice: true, stockQty: true, category: true,
      location: true, active: true,
      company: { select: { name: true } },
    },
  });
  callback(product ?? null);
});
```

**Desktop preload:** `desktop/electron/preload.cjs`

Created a Socket.io client connection exposed via `window.electronAPI.socket.scanBarcode(barcode)`. Returns a Promise that resolves with the product or null.

**Frontend:** `desktop/src/lib/api.ts`, `desktop/src/pages/POS.tsx`

Added `socketProductScan()` to the API layer. POS.tsx now tries Socket.io first, with automatic fallback to the REST `/barcode-fast/` endpoint if Socket.io is unavailable.

---

### 3.6 Frontend: Fast Barcode Endpoint Usage

**Files:** `desktop/src/lib/api.ts`, `desktop/src/pages/POS.tsx`, `desktop/src/pages/Stock.tsx`

Added `getByBarcodeFast()` to the API layer which calls the new `/api/products/barcode-fast/:barcode` endpoint. This endpoint returns only 9 core fields (camelCase from Prisma) instead of the full normalized 30+ column Product object, keeping the JSON payload minimal for high-frequency barcode scans.

**Updated call sites:**
- `POS.tsx` — barcode scan on Enter key now uses `getByBarcodeFast()` and maps the camelCase response to the snake_case `Product` shape
- `Stock.tsx` — both `handleScan()` and `handleToolbarScan()` now use `getByBarcodeFast()` (they only need the product `id`)

**Behavior change:** Barcode scanning now skips the price-tier selection dialog and adds the item directly with the default `sale_price`. This makes scanning instantaneous. Users who need price-tier selection can still use the manual search dropdown.

---

### 3.7 PM2 Fork Mode (Not Cluster) on Windows

Prisma uses a Rust-based engine binary. Running PM2 in cluster mode spawns multiple Node processes, each with its own Prisma connection pool. On Windows with default PostgreSQL `max_connections` (usually 100), 8 cluster forks × 20 pool connections = 160 connections → connection exhaustion.

**Recommendation:** Run PM2 in **fork mode** (single instance) for the server PC unless you have proven CPU bottlenecks.

```bash
pm2 start ecosystem.config.js --env production
```

**ecosystem.config.js example:**

```javascript
module.exports = {
  apps: [{
    name: 'faraz-pharmacy-server',
    script: 'dist/server.js',
    instances: 1,        // Fork mode: 1 instance
    exec_mode: 'fork',
    max_restarts: 10,
    env: {
      NODE_ENV: 'production',
    },
  }],
};
```

---

### 3.8 Configure Explicit Connection Pooling

**File:** `server/.env`

```
DATABASE_URL="postgresql://user:password@localhost:5432/faraz-pharmacy?connection_limit=20&pool_timeout=30&connect_timeout=10"
```

---

## 4. Short-Term Actions (Next 2–4 Weeks)

### 4.1 Move Barcode & Product Search to Socket.io

Your server already has Socket.io initialized (`server/src/socket/index.ts`), and `purchases.service.ts` already emits `emitEvent("stock:updated", ...)`. Use this for high-frequency reads.

**Current (slow):**
```
Client → HTTP GET /api/products/barcode/123 → Express → Prisma → PostgreSQL → JSON → Client
```

**Optimized (fast):**
```
Client → Socket.io emit "product:scan" → Server → Prisma → PostgreSQL → Socket.io emit "product:found" → Client
```

**Why:** Socket.io maintains an open TCP pipe. No HTTP handshake, no headers, no connection overhead per scan.

**Files to touch:**
- `server/src/socket/index.ts` — add handlers for `product:scan`, `stock:check`
- `desktop/src/lib/api.ts` or POS page — replace `api.products.getByBarcode()` with socket event for scans

---

### 4.2 Prevent N+1 Queries

Audit all `.findMany()` calls. Every relational fetch must use `.include()` or `.select()` in a **single query**, never a loop.

**Bad (N+1):**
```typescript
const products = await prisma.product.findMany();
for (const p of products) {
  const batches = await prisma.productBatch.findMany({ where: { productId: p.id } }); // N queries
}
```

**Good (1 query):**
```typescript
const products = await prisma.product.findMany({
  include: { batches: true, prices: true },
});
```

**Action:** Review `products.service.ts`, `sales.service.ts`, and `purchases.service.ts` for loops that query the database.

---

### 4.3 Add Server-Side Query Result Cache

Cache frequently requested, slowly changing data in Node.js memory (e.g., `node-cache` or a simple `Map` with TTL):

- Top products for POS dropdown
- Today's sales totals
- Active customer list

**Example:**
```typescript
import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

// Before querying Postgres:
const cached = cache.get('top-products');
if (cached) return cached;
const data = await prisma.product.findMany({...});
cache.set('top-products', data);
return data;
```

---

## 5. Medium-Term Actions (Client-Side Offline Cache)

Since you rejected moving from PostgreSQL to SQLite on the server, the correct client-side compromise is **IndexedDB inside Electron** (via Dexie.js). This gives you local, near-instant reads without a second server database.

### 5.1 Architecture

```
┌─────────────┐      LAN (Ethernet)      ┌──────────────────┐
│  Electron   │ ◄───────────────────────►│  Express + Postgres│
│  Client     │       REST / Socket.io   │   (Server PC)    │
│  (IndexedDB)│                          │                  │
└─────────────┘                          └──────────────────┘
       ▲
       │ Local IndexedDB query (~1 ms)
       └── Barcode scan, product lookup, price check
```

### 5.2 Implementation Plan

1. **Install Dexie.js** in the desktop project:
   ```bash
   npm install dexie
   ```

2. **Define local schema** (`desktop/src/lib/localDb.ts`):
   ```typescript
   import Dexie from 'dexie';

   export class PharmacyDb extends Dexie {
     products!: Dexie.Table<Product, string>;
     priceTiers!: Dexie.Table<ProductPrice, string>;
     customers!: Dexie.Table<Customer, string>;
     pendingSales!: Dexie.Table<any, string>;

     constructor() {
       super('PharmacyDB');
       this.version(1).stores({
         products: 'id, barcode, name, salePrice, purchasePrice, stockQty, updatedAt',
         priceTiers: 'id, productId, label',
         customers: 'id, name, phone',
         pendingSales: 'id, createdAt, synced',
       });
     }
   }

   export const db = new PharmacyDb();
   ```

3. **Sync on boot:** When the Electron app starts and the server is reachable, fetch `GET /api/products/sync` (full active catalog + price tiers) and write to IndexedDB. Store a `lastSyncedAt` timestamp.

4. **Barcode scan flow:**
   - Query IndexedDB first → instant result.
   - If not found locally, fall back to Socket.io/REST server lookup.
   - Cache the result locally for next time.

5. **Offline sales queue:** If the server is unreachable at checkout, write the sale to `pendingSales` in IndexedDB. A background worker uploads pending sales when the server is back online.

### 5.3 Conflict Warning

Offline-first introduces stock conflicts: two terminals selling the same last item while offline. On sync, PostgreSQL must validate stock and reject sales that cannot be fulfilled. Design this rejection flow before deploying offline checkout.

---

## 6. Windows OS & Network Tweaks

| Item | Recommendation |
|------|---------------|
| **PM2 as Windows Service** | Use `pm2-windows-service` or `qckwinsvc` so the Express backend starts automatically after server PC reboot, without manual login. |
| **Server Network Adapter** | Set the server PC's Ethernet adapter to **never sleep** or turn off to save power. This prevents lag spikes when client machines wake dormant network ports. |
| **Static IPs** | Ensure all clients connect to the server by static IP (not hostname) to avoid DNS resolution delays. |
| **Firewall** | Allow Express port (e.g., 3001) and Socket.io port through Windows Firewall on the server PC. |

---

## 7. What NOT to Do

| Item | Reason |
|------|--------|
| **Replace PostgreSQL with SQLite on the server** | You need multi-terminal relational integrity, concurrent writes, and server-side reporting. PostgreSQL is correct. |
| **PM2 cluster mode without tuning connection limits** | Each forked process opens its own Prisma pool. On Windows, this exhausts PostgreSQL connections quickly. |
| **Create `new PrismaClient()` inside request handlers** | Connection leaks and pool exhaustion under load. |
| **Fetch full product objects for barcode scans** | Wasteful JSON serialization. Use targeted `select`. |
| **Render 10,000+ products in a single React dropdown** | DOM freeze. Virtualize lists (`@tanstack/react-virtual`) if your catalog exceeds ~2,000 items. |

---

## 8. Implementation Priority Matrix

| Priority | Task | Effort | Risk | Impact | Status |
|----------|------|--------|------|--------|--------|
| **1** | PrismaClient singleton in `services/prisma.ts` | 15 min | Zero | High | ✅ Done |
| **1** | PostgreSQL indexes (`schema.prisma` + migrate) | 30 min | Low | Very High | ✅ Done |
| **1** | Targeted `select` on barcode lookup + `/barcode-fast` endpoint | 30 min | Zero | High | ✅ Done |
| **1** | Express `compression` middleware | 15 min | Zero | Medium | ✅ Done |
| **1** | PM2 fork mode + `connection_limit` in `.env` | 30 min | Low | Medium | ⬜ Pending |
| **2** | Socket.io for barcode scan / stock check | 2–4 hours | Low | High | ✅ Done |
| **2** | Server-side memory cache (node-cache) | 1 hour | Low | Medium | ⬜ Pending |
| **3** | Dexie.js IndexedDB client cache + sync | 1–2 weeks | Medium | Very High | ⬜ Pending |
| **3** | Virtualize large product lists/tables | 4–8 hours | Low | Medium | ⬜ Pending |
| **3** | PM2 Windows Service + power settings | 30 min | Low | Medium | ⬜ Pending |

---

## 9. Summary

Start with **Priority 1** this week. These require no architectural debate, no client-side changes, and will make your LAN POS feel instantly faster:

1. Verify the Prisma singleton.
2. Add database indexes.
3. Narrow the barcode lookup `select`.
4. Enable Express compression.
5. Lock PM2 to fork mode with explicit connection pooling.

Then evaluate whether Socket.io search and the IndexedDB client cache are needed based on real-world cashier feedback.

---

*End of document*