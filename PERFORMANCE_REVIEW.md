# Faraz Pharmacy — Performance Review

Date: 2026-10-22

Scope: `server/` (Express + Prisma + PostgreSQL) and `desktop/` (Electron + React + Vite), with focus on why client PCs feel slow.

## Current Performance Score

**Overall: 4 / 10**

| Area | Score | Reason |
|---|---:|---|
| Database and query performance | 3 / 10 | Almost no secondary indexes; correlated subqueries on every customer/arrears row |
| API efficiency and payload size | 3 / 10 | Unpaginated endpoints return up to 100,000 rows; no gzip/brotli compression |
| Frontend startup and bundle size | 5 / 10 | Single 1.57 MB bundle, eager page imports, but simple UI and no blocking assets |
| Caching and data fetching | 4 / 10 | Default React Query settings; Dashboard and reports refetch and recompute client-side |
| Background resource usage | 6 / 10 | Polling is present but relatively light; multiple windows duplicate memory/network work |
| Functional reliability | 8 / 10 | Core workflows and endpoints work correctly; issues are primarily performance |

Interpretation:

- At the **current small data volume**, the software is usable and scores closer to **6–7 / 10**.
- At **production data volume with multiple clients**, the current architecture scores **4 / 10**.
- After Phase 1 and Phase 2, the expected score is **7–8 / 10**. After Phase 3, **8–9 / 10**.

## Executive Summary

The application works, but it is built like a small-data app and is being used with production-sized data. The biggest slowdowns are not caused by React rendering; they come from:

1. **Missing database indexes**, especially on `sales(customer_id)`, `arrears(customer_id)`, `sale_items(sale_id)`, and date columns. Customer and arrears endpoints run correlated subqueries per row over unindexed tables.
2. **Whole-table API responses.** Unpaginated endpoints default to `limit = 100000`. Dashboard and almost every report download all customers, products, sales, stock, or arrears and aggregate them in the browser.
3. **No HTTP compression.** The API sends large JSON payloads uncompressed over the LAN.
4. **One 1.57 MB JavaScript bundle with eager imports.** Every page, chart library, and animation library loads before the login screen is usable. On weak client PCs this is noticeable at startup and on every new POS window.
5. **Default React Query cache settings.** `staleTime: 0`, `refetchOnWindowFocus: true`, and 3 retries cause repeated heavy refetches whenever an Electron window regains focus.
6. **Checkout does an unnecessarily heavy customer read.** After each sale it loads the customer's entire purchase/arrears history just to print the outstanding arrears total.

Fixing the database indexes, adding compression, caching, and server-side dashboard/report endpoints will produce the largest gains with low risk. Code splitting and bundle trimming improve startup and multi-window memory use.

## What Was Measured

- Production renderer build (`vite build`):
  - JS: `dist/assets/index-BOcGPwNo.js` — **1,572.77 kB raw / 419.64 kB gzip**
  - CSS: **100.31 kB raw / 15.00 kB gzip**
  - Modules: **2,862**
  - Build time: **~2m 36s** on this machine
- Server middleware: only `cors()`, `helmet()`, `express.json()` — no `compression()`.
- Query client: `new QueryClient()` with library defaults.
- Local dev database currently has almost no data (`sales = 0`, `customers = 0`, `products = 2`), so timings measured locally do not represent a busy pharmacy. The issues below are structural and will appear as data grows.

## Findings by Priority

### P0 — Add the missing database indexes

The schema only declares indexes on `product_batches`. Everything else relies on primary keys and unique constraints. Customer stats, arrears summaries, reports, and invoice lookups all filter or join on unindexed columns.

Current hot queries:

- `customers.service.ts:12-15` — three correlated subqueries per customer on `sales.customer_id` and `arrears.customer_id`.
- `arrears.service.ts:283-292` — eight correlated subqueries per customer on `arrears.customer_id`.
- `sales.service.ts:142-155` and report endpoints — filter by `sales.created_at`.
- Sale detail, returns, and purchase history — join on `sale_items.sale_id`, `sale_items.product_id`, `stock_purchases.product_id`, `returns.sale_id`.

Recommended migration (`server/prisma/migrations/<timestamp>_add_performance_indexes/migration.sql`):

```sql
-- Sales and sale items
CREATE INDEX IF NOT EXISTS sales_created_at_idx ON sales(created_at);
CREATE INDEX IF NOT EXISTS sales_customer_id_idx ON sales(customer_id);
CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS sale_items_product_id_idx ON sale_items(product_id);

-- Arrears
CREATE INDEX IF NOT EXISTS arrears_customer_id_idx ON arrears(customer_id);
CREATE INDEX IF NOT EXISTS arrears_status_idx ON arrears(status);
CREATE INDEX IF NOT EXISTS arrears_sale_id_idx ON arrears(sale_id);
CREATE INDEX IF NOT EXISTS arrear_payments_arrear_id_idx ON arrear_payments(arrear_id);

-- Returns
CREATE INDEX IF NOT EXISTS returns_sale_id_idx ON returns(sale_id);
CREATE INDEX IF NOT EXISTS return_items_return_id_idx ON return_items(return_id);
CREATE INDEX IF NOT EXISTS return_items_product_id_idx ON return_items(product_id);

-- Stock / purchases
CREATE INDEX IF NOT EXISTS stock_purchases_product_id_idx ON stock_purchases(product_id);
CREATE INDEX IF NOT EXISTS stock_purchases_created_at_idx ON stock_purchases(created_at);
CREATE INDEX IF NOT EXISTS stock_purchases_distributor_id_idx ON stock_purchases(distributor_id);
CREATE INDEX IF NOT EXISTS stock_purchases_active_idx ON stock_purchases(active);

-- Products / customers / expenses
CREATE INDEX IF NOT EXISTS products_active_idx ON products(active);
CREATE INDEX IF NOT EXISTS products_name_idx ON products(name);
CREATE INDEX IF NOT EXISTS products_company_id_idx ON products(company_id);
CREATE INDEX IF NOT EXISTS customers_active_idx ON customers(active);
CREATE INDEX IF NOT EXISTS expenses_created_at_idx ON expenses(created_at);
CREATE INDEX IF NOT EXISTS product_prices_product_id_idx ON product_prices(product_id);
CREATE INDEX IF NOT EXISTS auth_tokens_user_id_idx ON auth_tokens(user_id);
```

Also add these to `server/prisma/schema.prisma` so future migrations keep them, for example:

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

For `ILIKE '%term%'` searches on customer/product names, add `pg_trgm` and GIN indexes:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS customers_name_trgm_idx ON customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_phone_trgm_idx ON customers USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON products USING gin (name gin_trgm_ops);
```

Expected result: customer list, arrears page, dashboard, and reports stop degrading linearly with history size.

### P0 — Stop loading whole tables in Dashboard and reports

Unpaginated endpoints fall back to `limit = 100000`:

- `server/src/modules/medicines/medicines.controller.ts:10`
- `server/src/modules/customers/customers.controller.ts:9`
- `server/src/modules/arrears/arrears.controller.ts:29`
- `server/src/modules/sales/sales.service.ts:217`
- `server/src/modules/purchases/purchases.service.ts` (`limit = 100000`)

Dashboard (`desktop/src/pages/Dashboard.tsx:54-67`) calls:

- `api.products.list` — all active products
- `api.customers.list` — all customers, each with three correlated subqueries
- `api.arrears.list` — all arrears
- `api.dashboard.stats` — already returns totals

It then sorts and slices 5 rows in the browser. On a real database this is the heaviest screen in the app.

Reports do the same:

- `reports/IncomeReport.tsx` — all sales + all expenses
- `reports/SalesReport.tsx` — paginated page **plus** `sales.listAll()`
- `reports/StockReport.tsx` — all products
- `reports/ExpiryReport.tsx` — all products
- `reports/ProductReport.tsx` — all products for the selector
- `reports/ZakatReport.tsx` — all products
- `reports/PurchaseReport.tsx` — paginated page plus `stock.list()`
- `reports/ArrearsReport.tsx` — all arrears
- `reports/ExpensesReport.tsx` — paginated page plus `expenses.list()`
- `reports/CompanyReport.tsx` — all companies

Recommended changes:

1. Extend `GET /api/dashboard/stats` to return the five low-stock products, five expiring products, five top customers, and five pending arrears directly. These are small SQL queries with `ORDER BY ... LIMIT 5`.
2. Remove the three list queries from `Dashboard.tsx` once the endpoint returns those arrays.
3. Add dedicated aggregation endpoints for reports (`/api/reports/sales-summary`, `/api/reports/income`, `/api/reports/stock-summary`, etc.) that return totals and chart series, not raw rows.
4. For selectors that genuinely need all products/customers, return only `id` and `name`, or support server-side search (`/api/products?search=...&limit=20`).
5. Set a hard maximum page size on the server (for example `max 200`) and remove the `100000` fallbacks. Keep a separate explicit `listAll` only where truly required.

### P0 — Add gzip/brotli compression

`server/src/app.ts:21-25` has no compression. Reports and customer lists can be hundreds of kilobytes to several megabytes of JSON.

```ts
import compression from "compression";
// ...
app.use(compression());
```

```powershell
npm install compression
npm install -D @types/compression
```

Verify with:

```powershell
curl.exe -s -H "Accept-Encoding: gzip" -D - http://localhost:3001/api/products -o NUL
```

Look for `Content-Encoding: gzip`. Typical JSON compression is 70–90%.

### P1 — Fix `reports.getStats()` granularity and payload

`server/src/modules/reports/reports.service.ts:46-58` groups by `createdAt`. Because `createdAt` is a timestamp, this produces **one row per sale**, not one row per day. A busy week returns thousands of rows, and the chart still has to sum them in the client.

Group by date in SQL instead:

```ts
const weekRevenue = await prisma.$queryRaw<{ day: string; revenue: number }[]>`
  SELECT
    to_char((created_at AT TIME ZONE 'Asia/Karachi')::date, 'YYYY-MM-DD') AS day,
    COALESCE(SUM(total), 0)::float AS revenue
  FROM sales
  WHERE created_at >= ${sevenDaysAgo}
  GROUP BY 1
  ORDER BY 1
`;
```

Do the same for the month series. Also make the day boundary explicit with a timezone instead of `new Date().setHours(0,0,0,0)`, which uses the server's local timezone.

### P1 — Remove the heavy customer read from checkout

After every sale, `desktop/src/pages/POS.tsx:372-376` calls `api.customers.getById()` only to obtain `outstanding_arrear`. That endpoint (`server/src/modules/customers/customers.service.ts:77-151`) loads **every sale with every item** and **every arrear with every payment** for the customer.

For a customer with years of history this can take seconds and happens before printing.

Recommended:

- Add `GET /api/customers/:id/summary` returning only `outstanding_arrear`, `total_purchases`, and `last_purchase`.
- Or return the updated arrears total from `POST /api/sales`.
- Change `customers.getById` to paginate `purchases` and `arrears` (for example latest 50), or use a separate `GET /api/customers/:id/purchases?page=...`.

### P1 — Tune React Query

`desktop/src/main.tsx:14` uses `new QueryClient()`:

- `staleTime: 0` — every mount refetches.
- `refetchOnWindowFocus: true` — Electron focus changes trigger refetches of all mounted queries.
- `retry: 3` — failed heavy requests are retried three times.

Recommended:

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

Keep short `staleTime` for live search/POS queries and rely on the existing `invalidateQueries` calls after mutations.

### P1 — Code splitting and bundle reduction

`desktop/src/App.tsx:14-32` imports every page eagerly. `vite.config.ts` has no manual chunks. Result: one 1.57 MB entry chunk.

Recommended:

1. Convert page imports to `React.lazy` and wrap routes in `Suspense`:

```tsx
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const POS = lazy(() => import("@/pages/POS"));
// ...
<Suspense fallback={<PageLoader />}>
  <Routes>...</Routes>
</Suspense>
```

2. Split stable vendor code in `vite.config.ts`:

```ts
build: {
  outDir: "dist",
  emptyOutDir: true,
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

3. Audit icon imports; import only the icons used if tree-shaking is not effective.
4. Consider removing `framer-motion` from POS window routes if its animations are not needed there.

Expected result: faster initial load, faster new POS windows, and lower memory per renderer process.

### P2 — Reduce background work

- `ServerConnectionContext.tsx` checks `/api/health` every 30 seconds. This is reasonable, but it also runs in every window.
- `Sidebar.tsx` polls the POS window count via IPC every 2.5 seconds. On a weak CPU this is minor but unnecessary; emit an event from the main process when windows open/close instead.
- `Topbar.tsx` updates a clock every second. Limit updates to once per minute unless seconds are displayed.
- Socket.io events are emitted by the server but no desktop code subscribes to them. Either implement listeners (which could replace polling) or remove the emit overhead.

### P2 — Report page double-fetching

Several report pages fetch the same data twice: once paginated for the table and once `listAll()` for totals. Examples:

- `SalesReport.tsx:31-49`
- `PurchaseReport.tsx:29-48`
- `ExpensesReport.tsx:39-61`

Compute totals on the server for the selected filter and return them in `meta`, so the client only makes one request.

### P2 — Customer list endpoint design

`customers.list` executes the stats subqueries for every returned row, including `COUNT(*)` over all sales. With `limit = 100000` this is the worst query in the app.

Options:

- Compute stats only for the requested page (the SQL already applies `LIMIT`, but PostgreSQL may still evaluate subqueries for all rows before sorting; check `EXPLAIN ANALYZE`).
- Better: join pre-aggregated subqueries once:

```sql
LEFT JOIN (
  SELECT customer_id, COUNT(*) AS total_purchases, MAX(created_at) AS last_purchase
  FROM sales
  GROUP BY customer_id
) s ON s.customer_id = c.id
LEFT JOIN (
  SELECT customer_id, SUM(balance_due) AS outstanding_arrear
  FROM arrears
  WHERE status = 'pending'
  GROUP BY customer_id
) a ON a.customer_id = c.id
```

This is still a full scan without the indexes above, but it avoids repeated per-row subqueries and is much easier for PostgreSQL to optimize.

## Suggested Implementation Order

### Phase 1 — Quick wins (hours, low risk)

1. Add `compression()` middleware.
2. Add the database indexes (test on a production database copy first).
3. Tune `QueryClient` defaults.
4. Replace the checkout `getById` call with a lightweight summary endpoint.
5. Lower unpaginated server limits from `100000` to a safe maximum (for example 500–1000), then fix any screen that depended on full lists.

### Phase 2 — Server-side aggregation (1–2 days)

1. Extend `/api/dashboard/stats` with the five dashboard lists.
2. Add report summary endpoints and remove `listAll` calls from report pages.
3. Fix `getStats` daily grouping and timezone handling.
4. Optimize `customers.list` and `arrears.listByCustomer` with joins/CTEs and `EXPLAIN ANALYZE`.

### Phase 3 — Frontend startup and multi-window cost (1–2 days)

1. Lazy-load routes and split vendor chunks.
2. Replace polling with IPC events where possible.
3. Reduce per-window health checks if many POS windows are open.
4. Rebuild and compare bundle sizes.

### Phase 4 — Infrastructure and client validation

1. Measure on one actual slow client PC and on the production server:
   - Chrome DevTools Performance and Network tabs (Electron DevTools).
   - `EXPLAIN (ANALYZE, BUFFERS)` on the customer, arrears, dashboard, and sales report queries.
   - Server CPU/RAM/disk during report generation.
2. Check whether clients are on Wi-Fi vs gigabit Ethernet.
3. Exclude the app, PostgreSQL data directory, and backup directory from Windows Defender real-time scanning on the server and client PCs.
4. Verify PostgreSQL settings (`shared_buffers`, `work_mem`, `effective_cache_size`) are appropriate for the server's RAM.
5. Confirm auto backup runs outside business hours; `pg_dump` can cause I/O spikes while staff are working.

## Verification Checklist

After each phase:

- [ ] `npx tsc --noEmit` in `server/` and `desktop/`
- [ ] `npm run build:renderer` and record JS/CSS sizes
- [ ] Login, open Dashboard, Products, Customers, Arrears, Stock, Reports, POS
- [ ] Complete one cash sale and one arrears sale; confirm receipt printing
- [ ] Confirm `/api/health` and key endpoints still return 200
- [ ] Confirm `Content-Encoding: gzip` on list/report responses
- [ ] Run `EXPLAIN ANALYZE` before/after on customer and report queries
- [ ] Test on a client PC with a production-sized database copy

## Notes and Limitations

- Local dev data is nearly empty, so no meaningful response-time benchmark could be taken. Conclusions are based on code paths, query shapes, payload defaults, and bundle measurements.
- The production database and the slow client hardware were not available during this review. Validate the highest-impact changes there.
- This review did not change application behavior. It is a report only.
