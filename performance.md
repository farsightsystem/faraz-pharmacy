# Faraz Pharmacy — Current Performance Audit

**Date:** 2026-11-01
**Scope:** `server/` (Express 5 + Prisma 7 + PostgreSQL, LAN server) and `desktop/` (Electron + React 19 + Vite), used by **5 client PCs over LAN**.
**Method:** Code-path audit, production renderer build measurement, PostgreSQL index audit, connection-pool inspection, and concurrent request testing. The local database is almost empty (1 product, 0 sales, 0 customers), so live timings do not represent a busy pharmacy; the score below is based on **structure and measured artifacts**, not on empty-database latency.

---

## 1. Executive Summary

**Overall current score: 4.5 / 10**

| Scenario | Score | Meaning |
|---|---:|---|
| Today, small dataset | 5 / 10 | Usable, but already has avoidable lag and heavy network payloads |
| At production volume (years of sales, 5 PCs) | 3.5 / 10 | Degrades linearly; reports/dashboard and customer/arrears pages become slow |

The application works, but it is still built like a small-data app. The biggest causes of slowness over LAN, in order:

1. **Most critical database indexes are still missing.** Only 6 performance indexes exist; `sales`, `sale_items`, `arrears`, `returns`, `customers` and others rely on sequential scans. Every dashboard/report/customer query degrades as history grows.
2. **Whole-table API payloads.** 10 controllers fall back to `limit = 100000`, and the desktop requests up to **10,000 products on every window boot** (`sync.ts`). Dashboard and most report pages download all products/customers/sales/arrears and aggregate in the browser.
3. **One 1.66 MB JavaScript bundle with eager imports.** Every page, Recharts and Framer Motion load before login is usable, on every Electron window and every one of the 5 PCs.
4. **Default React Query settings.** `staleTime: 0`, `refetchOnWindowFocus: true`, `retry: 3` — each window focus can refetch heavy lists.
5. **Dashboard and reports recompute on the client** instead of returning small server-side aggregates. `reports.getStats()` even groups by raw timestamp (one row per sale).
6. **Checkout loads the customer's entire purchase + arrears history** just to print the outstanding total.

Good things already in place (they helped): gzip compression, server-side `node-cache`, a fast barcode endpoint + Socket.io scan path, a Dexie/IndexedDB client cache, an explicit DB pool (20 connections), and read-only list queries no longer wrapped in transactions.

---

## 2. Scorecard

| Area | Score | Reason |
|---|---:|---|
| Database & query performance | 3 / 10 | Critical indexes missing on `sales`, `sale_items`, `arrears`, `returns`, `customers`, `expenses`, `product_prices`; customer/arrears use correlated subqueries |
| API efficiency & payload size | 4 / 10 | Compression + cache + fast barcode exist, but 100000 fallbacks and full-table dashboard/report fetches remain |
| Frontend startup & bundle | 4 / 10 | Single 1.66 MB (459 KB gzip) bundle, 2868 modules, eager page imports, no manual chunks |
| Caching & data fetching | 4 / 10 | Server cache is good; React Query is still on library defaults and dashboard recomputes client-side |
| Background resource usage | 5 / 10 | Health poll every 30 s per window, Sidebar poll 2.5 s, Topbar clock 1 s, full product sync per window |
| Functional reliability | 8 / 10 | Core flows work; issues are performance, not correctness |

---

## 3. What Was Measured

### Renderer build (production)

Measured with `npm run build:renderer` on 2026-11-01:

| Asset | Raw | Gzip |
|---|---:|---:|
| `dist/assets/index-*.js` | **1,659.7 KB** | **459 KB** |
| `dist/assets/index-*.css` | 97.7 KB | 15 KB |
| Modules transformed | **2,868** | — |

Vite warns: *"Some chunks are larger than 500 kB after minification."* There is **no code splitting and no manual chunking**.

### PostgreSQL index audit

`pg_indexes` currently contains **37 indexes**, but only these are performance indexes:

```
products(name), products(location), products(created_at)
stock_purchases(product_id), stock_purchases(invoice_number), stock_purchases(created_at)
product_batches(product_id, expiry_date), product_batches(batch_number)
```

Everything else is a primary key or unique constraint. **No index exists on** `sales(customer_id)`, `sales(created_at)`, `sale_items(sale_id)`, `sale_items(product_id)`, `arrears(customer_id)`, `arrears(status)`, `arrear_payments(arrear_id)`, `returns(sale_id)`, `return_items(...)`, `customers(active)`, `expenses(created_at)`, `product_prices(product_id)`, `auth_tokens(user_id)`.

Note: `server/prisma/migrations/20261030110013_add_performance_indexes/migration.sql` only adds the 6 indexes above. The larger recommended set was never applied, and `schema.prisma` does not declare them either, so future `db push`/migrations will not add them.

### Connection pool

`server/src/services/prisma.ts` now configures a 20-connection pool (`PG_POOL_MAX`, default 20) with a 10 s connect timeout. Verified: the running server shows `application_name = faraz-pharmacy-server` with up to 20 idle connections. A 40-request concurrent test against `/api/products`, `/api/dashboard/stats`, `/api/customers`, `/api/arrears`, `/api/stock` returned **40/40 HTTP 200 with no P2028 errors**.

### Payload / request shape (structural)

- Dashboard load = 4 HTTP requests: `stats`, all products, all customers, all arrears → roughly **15+ DB queries**, then client-side sort/slice.
- `GET /api/customers` runs **3 correlated subqueries per returned row** (`customers.service.ts:13-16`).
- `sync.ts` requests `limit: 10000` products (with prices + company) on app boot, in **every window**.
- 10 controllers fall back to `limit = 100000`; 6 services default to `limit = 100000`.

---

## 4. Findings by Priority

### P0 — Missing database indexes (biggest server-side win)

Hot queries that currently scan:

- `server/src/modules/customers/customers.service.ts:13-16` — 3 correlated subqueries per row on `sales.customer_id` and `arrears.customer_id`.
- `server/src/modules/arrears/arrears.service.ts` — filtering/sorting arrears by `customer_id`, `status`, `created_at`; payments by `arrear_id`.
- `server/src/modules/sales/sales.service.ts` and report endpoints — filter by `sales.created_at`.
- Sale detail / returns / purchase history — joins on `sale_items.sale_id`, `sale_items.product_id`, `returns.sale_id`, `return_items.return_id`, `stock_purchases.distributor_id`.
- `ILIKE '%term%'` searches on customer/product name/phone (no trigram indexes).

**Effect:** the dashboard, customers, arrears and reports slow down linearly with history. At 5 terminals this is the main "feels slow" driver.

### P0 — Whole-table fetching in dashboard and reports

- `desktop/src/pages/Dashboard.tsx:54-92` fetches **all** products, **all** customers, **all** arrears, then filters/sorts/slices 5 rows in the browser.
- `server/src/modules/reports/reports.service.ts:36` stats does not return the 5 dashboard lists, forcing the client to download everything.
- Report pages fetch full tables:
  - `reports/IncomeReport.tsx` → all sales + all expenses
  - `reports/SalesReport.tsx` → page **plus** `sales.listAll()`
  - `reports/PurchaseReport.tsx` → page **plus** `stock.list()`
  - `reports/ExpensesReport.tsx` → page **plus** `expenses.list()`
  - `reports/StockReport.tsx`, `ExpiryReport.tsx`, `ProductReport.tsx`, `ZakatReport.tsx` → all products
  - `reports/ArrearsReport.tsx` → all arrears; `reports/CompanyReport.tsx` → all companies
- `desktop/src/lib/sync.ts:27-33` requests **10,000** products per boot; `App.tsx:63-78` runs this in every window.

### P0 — Unbounded `limit = 100000`

10 controllers fall back to `100000` when not paginated (e.g. `server/src/modules/medicines/medicines.controller.ts:10`), and 6 services default to `100000` (e.g. `customers.service.ts:21`, `arrears.service.ts:22`, `sales.service.ts:219`, `purchases.service.ts:10`). One accidental full-list call can transfer megabytes over LAN and hold a DB connection while serializing.

### P1 — `reports.getStats()` groups by timestamp, not day

`server/src/modules/reports/reports.service.ts:46-58` uses `groupBy: ["createdAt"]`. Because `createdAt` is a timestamp, this returns **one row per sale**, not one row per day. A busy week returns thousands of rows that the chart then has to process. It also uses server-local midnight instead of an explicit timezone.

### P1 — Checkout loads full customer history

`desktop/src/pages/POS.tsx:453` calls `api.customers.getById()` after each sale only to read `outstanding_arrear`. That endpoint (`server/src/modules/customers/customers.service.ts:99-126`) loads **every sale with every item** and **every arrear with every payment** for the customer. For a long-time customer this can take seconds and happens before printing.

### P1 — React Query defaults

`desktop/src/main.tsx:14` uses `new QueryClient()`:
- `staleTime: 0` → every mount refetches.
- `refetchOnWindowFocus: true` → Electron window focus changes refetch every mounted query.
- `retry: 3` → heavy failed requests are retried three times.

With 5 PCs and multiple windows, this multiplies server load.

### P1 — Bundle size and eager imports

- `desktop/src/App.tsx:15-33` imports all 20 pages eagerly.
- `desktop/vite.config.ts` has no `manualChunks`.
- Result: one **1.66 MB / 459 KB gzip** entry chunk (2,868 modules). Recharts + Framer Motion + all pages load before login on every window.

### P2 — Background work

- `desktop/src/contexts/ServerConnectionContext.tsx:33,83-89` polls `/api/health` every 30 s **per window**.
- `desktop/src/components/layout/Sidebar.tsx:91` polls POS window count every 2.5 s.
- `desktop/src/components/layout/Topbar.tsx:45` updates a clock every 1 s.
- Socket.io server emits events, but the desktop does not subscribe to domain events (only barcode scan), so it cannot replace polling yet.

### P2 — Report double-fetching

Several reports fetch the same data twice: once paginated for the table and once `listAll()` for totals (`SalesReport.tsx:31-49`, `PurchaseReport.tsx:29-48`, `ExpensesReport.tsx:39-61`). Totals should be computed server-side and returned in `meta`.

### P2 — Customer/arrears query shape

`customers.service.ts:74-83` runs per-row correlated subqueries. Pre-aggregated `LEFT JOIN`s (or `GROUP BY`) are far easier for PostgreSQL to optimize once indexes exist. `arrears.list` includes `payments` for every row, which inflates payload.

---

## 5. Solutions (prioritized)

### P0.1 — Add the missing indexes (do this first)

Create a new migration:

```sql
-- Sales / sale items
CREATE INDEX IF NOT EXISTS sales_created_at_idx   ON sales(created_at);
CREATE INDEX IF NOT EXISTS sales_customer_id_idx  ON sales(customer_id);
CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS sale_items_product_id_idx ON sale_items(product_id);

-- Arrears
CREATE INDEX IF NOT EXISTS arrears_customer_id_idx ON arrears(customer_id);
CREATE INDEX IF NOT EXISTS arrears_status_idx      ON arrears(status);
CREATE INDEX IF NOT EXISTS arrears_sale_id_idx     ON arrears(sale_id);
CREATE INDEX IF NOT EXISTS arrear_payments_arrear_id_idx ON arrear_payments(arrear_id);

-- Returns
CREATE INDEX IF NOT EXISTS returns_sale_id_idx ON returns(sale_id);
CREATE INDEX IF NOT EXISTS return_items_return_id_idx ON return_items(return_id);
CREATE INDEX IF NOT EXISTS return_items_product_id_idx ON return_items(product_id);

-- Stock / purchases
CREATE INDEX IF NOT EXISTS stock_purchases_distributor_id_idx ON stock_purchases(distributor_id);
CREATE INDEX IF NOT EXISTS stock_purchases_active_idx ON stock_purchases(active);

-- Products / customers / expenses / prices / tokens
CREATE INDEX IF NOT EXISTS products_active_idx ON products(active);
CREATE INDEX IF NOT EXISTS products_company_id_idx ON products(company_id);
CREATE INDEX IF NOT EXISTS customers_active_idx ON customers(active);
CREATE INDEX IF NOT EXISTS expenses_created_at_idx ON expenses(created_at);
CREATE INDEX IF NOT EXISTS product_prices_product_id_idx ON product_prices(product_id);
CREATE INDEX IF NOT EXISTS auth_tokens_user_id_idx ON auth_tokens(user_id);
```

For `ILIKE '%term%'` search:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS customers_name_trgm_idx  ON customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_phone_trgm_idx ON customers USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_name_trgm_idx   ON products  USING gin (name gin_trgm_ops);
```

Also declare them in `server/prisma/schema.prisma` so future migrations keep them, e.g.:

```prisma
model Sale {
  // ...
  @@index([createdAt])
  @@index([customerId])
}
model SaleItem {
  // ...
  @@index([saleId])
  @@index([productId])
}
```

Apply with `cd server && npx prisma migrate dev --name add_performance_indexes_round2` (test on a production copy first; index creation briefly locks writes).

**Expected impact:** highest. Customer/arrears/dashboard/report queries stop degrading with history.

### P0.2 — Return dashboard data from the server

Extend `GET /api/dashboard/stats` to also return `lowStockProducts` (5), `expiringProducts` (5), `topCustomers` (5), `pendingArrears` (5), each with `ORDER BY ... LIMIT 5` in SQL. Then remove the three full-list queries from `Dashboard.tsx` and delete the client-side `filter/sort/slice` blocks.

**Expected impact:** Dashboard goes from 4 large requests (~15+ queries, whole tables) to 1 small request.

### P0.3 — Cap page sizes and stop full-table fetches

- Replace the `100000` fallbacks with a hard maximum (e.g. 200) and keep explicit `listAll` only where truly required.
- For selector dropdowns that need all products/customers, return only `id` and `name`, or add server-side search (`/api/products?search=...&limit=20`).
- Change the boot sync from 10,000 full products to a **compact catalog** (`id, barcode, name, sale_price, purchase_price, stock_qty, updated_at`) and make it **incremental** (`?updatedSince=...`) or run it only once per machine, not per window.

### P1.1 — Fix `getStats` daily grouping

```ts
const weekRevenue = await prisma.$queryRaw<{ day: string; revenue: number }[]>`
  SELECT to_char((created_at AT TIME ZONE 'Asia/Karachi')::date, 'YYYY-MM-DD') AS day,
         COALESCE(SUM(total), 0)::float AS revenue
  FROM sales
  WHERE created_at >= ${sevenDaysAgo}
  GROUP BY 1
  ORDER BY 1
`;
```

Do the same for the 30-day series. Use an explicit timezone instead of `setHours(0,0,0,0)`.

### P1.2 — Lightweight checkout customer summary

Add `GET /api/customers/:id/summary` returning only `outstanding_arrear`, `total_purchases`, `last_purchase`, and use it in `POS.tsx:453`. Also paginate `customers.getById` purchases/arrears (e.g. latest 50) for the detail page.

### P1.3 — Tune React Query

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

Keep short `staleTime` only for live POS search queries; rely on the existing `invalidateQueries` after mutations.

### P1.4 — Code splitting and vendor chunks

```tsx
import { lazy, Suspense } from "react";
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const POS = lazy(() => import("@/pages/POS"));
// ...all pages
<Suspense fallback={<PageLoader />}>
  <Routes>...</Routes>
</Suspense>
```

```ts
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        react: ["react", "react-dom", "react-router-dom"],
        query: ["@tanstack/react-query"],
        charts: ["recharts"],
        motion: ["framer-motion"],
      },
    },
  },
},
```

**Expected impact:** faster login, faster new POS windows, lower memory per renderer.

### P2.1 — Reduce background work

- Emit an IPC event from the main process when POS windows open/close instead of polling every 2.5 s.
- Only tick the Topbar clock every minute unless seconds are shown.
- Consider a single shared health check (or longer interval) instead of one per window.
- Subscribe to Socket.io `stock:updated`/sale events to refresh data instead of polling.

### P2.2 — Server-side report totals

Compute totals for the selected filter and return them in `meta`, so report pages make one request instead of a page + `listAll()`.

### P2.3 — Optimize customer/arrears queries

Replace per-row correlated subqueries with pre-aggregated joins:

```sql
LEFT JOIN (
  SELECT customer_id, COUNT(*) AS total_purchases, MAX(created_at) AS last_purchase
  FROM sales GROUP BY customer_id
) s ON s.customer_id = c.id
LEFT JOIN (
  SELECT customer_id, SUM(balance_due) AS outstanding_arrear
  FROM arrears WHERE status = 'pending' GROUP BY customer_id
) a ON a.customer_id = c.id
```

For `arrears.list`, avoid including all `payments` for every row; load payments on demand for the selected arrear.

---

## 6. Recommended Roadmap

| Phase | Work | Effort | Risk | Impact |
|---|---|---|---|---|
| **1 (hours)** | Add missing indexes + declare in schema; cap limits; React Query config; lightweight checkout summary | 0.5–1 day | Low | Very high |
| **2 (1–2 days)** | Server-side dashboard lists; fix daily grouping; server-side report totals | 1–2 days | Low/Medium | High |
| **3 (1–2 days)** | Lazy routes + vendor chunks; incremental/compact sync; reduce polling | 1–2 days | Low | Medium/High |
| **4 (infra)** | Validate on a real slow client + production DB copy; `EXPLAIN (ANALYZE, BUFFERS)`; PostgreSQL `shared_buffers`/`work_mem`; exclude DB/backup dirs from Defender; wired Ethernet + static IPs; PM2 fork mode (1 instance) | 0.5 day | Low | Medium |

---

## 7. Verification Checklist

After each phase:

- [ ] `cd server && npx tsc --noEmit`
- [ ] `cd desktop && npx tsc --noEmit && npm run build:renderer` (record JS/CSS sizes)
- [ ] Login, open Dashboard, Products, Customers, Arrears, Stock, Reports, POS on one client
- [ ] Complete one cash sale and one arrears sale; confirm receipt printing
- [ ] `EXPLAIN (ANALYZE, BUFFERS)` on customer list, arrears list, dashboard stats, sales report — confirm index scans, not seq scans
- [ ] Confirm `Content-Encoding: gzip` on list/report responses
- [ ] Measure dashboard load and product sync on one real slow client PC with a production DB copy
- [ ] Confirm only **one** server instance is running (no duplicate `EADDRINUSE`/pool multiplication)

---

## 8. Expected Score After Fixes

| Milestone | Overall score |
|---|---:|
| Current | **4.5 / 10** |
| After Phase 1 (indexes, limits, query config, checkout summary) | 6.5 / 10 |
| After Phase 2 (server-side dashboard + report aggregation) | 7.5 / 10 |
| After Phase 3 (code splitting, compact sync, less polling) | 8.5 / 10 |
| After Phase 4 (infra tuning + real-client validation) | 9 / 10 |

---

## 9. Notes / Limitations

- The local database is nearly empty (1 product, 0 sales, 0 customers), so no representative response-time benchmark could be taken. Findings are based on query shapes, missing indexes, payload defaults, and the measured bundle.
- The production database and the actual slow client hardware were not available. Validate Phase 1 on a production copy before deploying.
- Index creation briefly locks writes; run it outside business hours.
- Keep the server at **one instance** (PM2 fork mode). Multiple instances each open a 20-connection pool and can exhaust PostgreSQL `max_connections` (100).

## 10. Phase 0 Baseline (2026-11-01)

### Operating target

- Offline behavior: cached catalog browsing/search is supported; checkout requires the server.
- Expected deployment: 3 concurrent terminals, 16 GB RAM on the server, 8 GB RAM on clients.
- Benchmark scale: 1,000 products, 1,000 customers, 300 sales/day with 4 line items per sale, one year of sales history.

### Validation and measurements

- Server type check (`cd server && npm run lint`): passed.
- Desktop type check (`cd desktop && npm exec -- tsc --noEmit`): passed.
- Renderer build: 2,868 modules; JavaScript **1,699.50 kB raw / 458.99 kB gzip**; CSS **100.07 kB raw / 15.02 kB gzip**. Vite still reports a chunk above 500 kB.
- Prisma migration status for the local database: all 4 migrations applied. The earlier `price_tier_id` error therefore needs to be checked against the exact database URL used by the failing server process if it recurs.
- Synthetic data was loaded temporarily into the local development database and removed after measurement. The fixture contained 1,000 products, 1,000 customers, 109,500 sales, 438,000 sale items, and 2,000 pending arrears. No synthetic rows were retained.
- Warm-cache local PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` results for query shapes used by the current services:

| Query shape | Execution time | Observed plan |
|---|---:|---|
| Customer list, first 50 rows with correlated sales/arrears statistics | **1,266 ms** | Repeated sequential scans of sales and arrears |
| Count sales from the last 30 days | **38.7 ms** | Sequential scan of sales |
| Product sales history with sale join | **54.3 ms** | Sequential scan of sale items; indexed lookups of sales by primary key |
| Dashboard top-five products aggregation | **96.3 ms** | Parallel sequential scan of sale items |

### Interpretation and limits

These are a reproducible-scale **local database baseline**, not a LAN or production benchmark: the measurements used a warm local cache, one client, synthetic uniform data, and no competing workload. Actual three-terminal latency, cold-cache disk reads, API serialization/network transfer, and slow-client startup remain unmeasured until the deployment hardware is available.

One additional finding surfaced during cleanup: deleting the synthetic sales without an index on `sale_items.sale_id` was prohibitively slow because PostgreSQL repeatedly checked the unindexed foreign-key column. A temporary index allowed safe cleanup and was dropped afterward. Include `sale_items.sale_id` in the Phase 1 index review.

## 11. Phase 1 Implementation and Retest (2026-11-01)

### Changes made

- Added migrations `20261101120000_add_transaction_performance_indexes` and `20261101121500_add_expense_date_index`, with matching Prisma schema indexes for sales, sale items, arrears/payments, returns, product prices, product-company lookup, customer status, stock-purchase supplier/status, and expense filtering/sorting.
- Applied the additive migration to the local development database; migration status is up to date.
- Added a server-side maximum page size of 200 for list controllers/services. Updated desktop “list all” API methods to request bounded pages and continue until all results are fetched, preserving complete results for callers that still require them.
- Changed report data requests to apply the selected date range at the API boundary, rather than downloading unrelated history first.
- Tuned React Query defaults to 30-second freshness, 5-minute garbage collection, no focus-triggered refetch, and one retry. POS product search remains immediately stale.
- Sale creation now returns the customer's outstanding arrears total, avoiding the checkout follow-up request that previously loaded full purchase and arrears history.

### Post-index query measurements

The same synthetic dataset and query shapes were loaded again temporarily, analyzed, measured, then removed. Database counts returned to the original values afterward.

| Query shape | Before | After | Change |
|---|---:|---:|---:|
| Customer list, first 50 rows with correlated statistics | 1,266 ms | **10.3 ms** | ~123× faster |
| Count sales from last 30 days | 38.7 ms | **6.5 ms** | ~6× faster |
| Product sales history with sale join | 54.3 ms | **9.0 ms** | ~6× faster |
| Dashboard top-five products aggregation | 96.3 ms | **112.1 ms** | No improvement; remains a full sale-item aggregation |

These are local warm-cache SQL timings, not end-to-end LAN timings. The slower top-products aggregate confirms that its full-history work needs server-side pre-aggregation or a narrower period in the dashboard/report phase.

### Verification

- `cd server && npm run lint`: passed.
- `cd desktop && npm exec -- tsc --noEmit`: passed after fixing call sites affected by list APIs returning arrays rather than paginated envelopes.
- `cd desktop && npm run build:renderer`: passed; JavaScript **1,700.24 kB raw / 459.23 kB gzip**, CSS **100.07 kB raw / 15.02 kB gzip**. Bundle remains above Vite's 500 kB chunk warning threshold.
- `cd server && npx prisma validate` and `npx prisma migrate status`: passed.
- `git diff --check`: passed.

### Remaining Phase 1 follow-up

Bounded pages limit each response but callers that explicitly need all rows still retrieve all pages. Dashboard full-list fetches, long-range report aggregation, the single large renderer bundle, and real three-terminal LAN behavior remain work for the next phase and deployment validation. Apply the migrations to each server database, then roll out the new server and desktop builds together: older desktop builds that still call legacy unpaginated endpoints will receive at most 200 rows and may show incomplete lists or reports.
