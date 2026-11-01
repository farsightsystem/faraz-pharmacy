# Conversation and Performance Work Record

This file records the project exploration, decisions, implementation, and validation from the conversation that led to the current performance work. It is a work log, not a verbatim transcript. Check the current source, migration status, and worktree before assuming that every item below is already deployed or committed.

## 1. Project Context

Faraz Pharmacy is a desktop pharmacy POS with:

- An Electron/React desktop application in `desktop/`.
- An Express/TypeScript API using Prisma and PostgreSQL in `server/`.
- LAN clients connecting to one machine that hosts the API/database.
- An IndexedDB/Dexie product catalog cache for local product lookup.
- A server-required checkout model. Offline catalog lookup is not a promise that sales can be completed without the server.

The user described three terminals in the initial deployment assumptions. The current [performance.md](./performance.md) also contains an audit scope of five client PCs. Confirm the intended number of clients before treating either number as the definitive deployment target.

The user initially asked to explore the project and explain [EFFICIENCY.md](./EFFICIENCY.md), [performance.md](./performance.md), and [PERFORMANCE_REVIEW.md](./PERFORMANCE_REVIEW.md). The project uses staged measurement and optimization: capture a baseline, make focused changes, retest, and distinguish local benchmark results from real LAN measurements.

## 2. Database Column Error

The user reported Prisma error `P2022`: `stock_purchases.price_tier_id` did not exist in the database, triggered by `stockPurchase.findMany()` in the purchases service.

The diagnosis was schema/database drift: compare the Prisma model and migration history against the schema of the database actually used by the running server, and verify that server's `DATABASE_URL`. A successful migration status on a development database does not prove that a different server instance points to that database.

## 3. Agreed Performance Scope and Assumptions

The performance discussion established these requirements and initial estimates:

- One server machine and LAN-connected desktop clients; internet is not required for normal application operation.
- The catalog can be read from its local cache when the server is unavailable; checkout remains server-dependent.
- Initial workload assumptions: approximately 1,000 products, 1,000 customers, 300 sales/day with four lines each, one year of sales history, three terminals, a 16 GB server, and 8 GB client PCs.
- Performance changes should be measured and preserve stock/checkout correctness. Production-like hardware testing was deferred until the user can test manually.
- Infrastructure tuning and real-client validation are separate from routine code optimization; they may lead to targeted code changes only if measurements reveal a bottleneck.

## 4. Phase 0 — Baseline

The user approved using the existing local database for temporary synthetic benchmark data. A synthetic workload was loaded, queried, and removed. Recorded counts were 1,000 products, 1,000 customers, 109,500 sales, 438,000 sale items, and 2,000 arrears. The database was reported as restored afterward to one product, zero customers, zero sales, zero sale items, and zero arrears.

Warm-cache local SQL timings before the index work:

| Query shape | Baseline |
|---|---:|
| Customer list, first 50 rows with correlated sales/arrears statistics | 1,266 ms |
| Count sales from last 30 days | 38.7 ms |
| Product sales history with sale join | 54.3 ms |
| Dashboard top-five product aggregation | 96.3 ms |

The baseline renderer bundle was reported as 1,699.50 kB JavaScript raw / 458.99 kB gzip and 100.07 kB CSS raw / 15.02 kB gzip. This is a local synthetic/warm-cache baseline, not a production LAN benchmark.

Cleanup exposed the cost of checking unindexed `sale_items.sale_id`; a temporary cleanup index was used and removed, and the permanent index was included in later index work.

The baseline and limits were documented in [performance.md](./performance.md).

## 5. Phase 1 — Database Indexes, Pagination, and Checkout Work

The user approved Phase 1, applied the migrations, and said they would perform manual testing while implementation continued.

The work recorded for this phase:

- Added migrations `20261101120000_add_transaction_performance_indexes` and `20261101121500_add_expense_date_index`.
- Added matching Prisma indexes for high-traffic transaction and lookup paths, including sales, sale items, arrears/payments, returns, product prices, product/company lookup, customer status, supplier/purchase lookup, and expenses.
- Added a server maximum page size of 200 and updated desktop list-all helpers to retrieve pages when a caller genuinely needs all rows.
- Changed report requests to send date-range filters to the API rather than downloading unrelated history.
- Tuned React Query freshness, garbage collection, focus-refetch, and retry defaults; POS product search remains immediately stale.
- Returned a customer's outstanding arrears total from sale creation to avoid loading full customer purchase/arrears history during checkout.

Synthetic workload query measurements after the indexes:

| Query shape | Before | After |
|---|---:|---:|
| Customer list | 1,266 ms | 10.3 ms |
| Last-30-day sales count | 38.7 ms | 6.5 ms |
| Product sales history | 54.3 ms | 9.0 ms |
| Dashboard top-products aggregate | 96.3 ms | 112.1 ms |

The all-history top-products query did not improve with ordinary indexes and remains a potential follow-up if its reporting semantics justify it. The user reported applying the Phase 1 migrations. Commands recorded as passing at that stage included server type-check, Prisma validation/migration status, desktop type-check and renderer build, and `git diff --check`.

Important deployment compatibility note: because older clients can call legacy list endpoints, deploying a server page cap without deploying updated clients can produce incomplete old-client lists/reports.

## 6. Phase 2 — Server-Side Dashboard and Report Summaries

The user asked the assistant to continue to the next phase while they handled manual testing.

The implementation in the current worktree includes:

- Dashboard stats now return compact server-computed widgets rather than requiring complete product/customer/arrears lists in the renderer.
- Added sales, purchase, expense, and income summary API routes and API client methods.
- Sales, Purchase, Expenses, and Income reports use server-side aggregates for KPIs. Tables remain paginated; detailed results are loaded for exports when requested.
- Dashboard and sales-summary revenue series group sales by day, zero-fill chart dates, and accept the workstation's timezone offset.
- Product revenue ranking uses sale-line subtotals to align with the “highest revenue” label.
- Date-only form keys use local calendar dates rather than UTC ISO date extraction.

An earlier isolated runtime check of report aggregates used temporary future-dated rows and passed; the rows were removed. A later attempt to run timezone-aware queries could not reach the local PostgreSQL server (`P1001`). Thus the offset-aware query changes passed type/schema/build checks, but still need runtime verification against a reachable database.

Known semantic points to verify:

- Dashboard low-stock count/list use active products with positive stock up to 10; the prior dashboard count used `stockQty <= 5`.
- The sales report's chart is the most recent 7/30 days, separately from a custom historical table filter.
- Sales profit/cost uses the product's current `purchase_price`, not immutable historical cost at the sale date.
- Dashboard top products still aggregates all sale-item history.

## 7. Phase 3 — Lazy Routes, Catalog Sync, and Polling

The implementation in the current worktree includes:

- Lazy loading route pages and splitting React/vendor and animation chunks. Dashboard chart code is kept with the lazy dashboard chunk.
- New compact catalog sync endpoint `GET /api/products/sync`, optionally taking `updatedSince`.
- Added `products.updated_at`, Prisma schema/index, and migration `server/prisma/migrations/20261102100000_add_product_updated_at/migration.sql`.
- Desktop cache sync performs a versioned initial/full refresh, incremental changes at a 30-minute freshness interval, and a full reconciliation daily. Product price tiers are updated with products and archived records are removed from the active IndexedDB cache.
- Uses the Web Locks API where available to serialize sync attempts between renderer windows on a machine. Cache stays available when server access fails; the failure is surfaced to the user.
- Sync is checked at startup, when a window becomes active, and periodically. Hard-deleted products are reconciled during full refresh.
- Replaced the Sidebar's 2.5-second POS-window count poll with Electron change notifications.
- Changed the clock timer from one second to one minute and health polling from 30 seconds to one minute; health checks pause while the window is hidden and retry on focus/network recovery.

Bundle after Phase 3:

| Renderer payload | Before Phase 3 | After Phase 3 |
|---|---:|---:|
| Main JavaScript chunk | 1,700.70 kB raw / 459.28 kB gzip | 458.02 kB raw / 132.31 kB gzip |
| Initial JS including shared React and motion chunks | 1,700.70 kB raw / 459.28 kB gzip | 820.46 kB raw / 249.42 kB gzip |
| Lazy dashboard chunk, including chart library | Included in main chunk | 420.85 kB raw / 113.69 kB gzip |

The final renderer build completed without the former >500 kB chunk warning. The lazy dashboard chart chunk remains large but is not part of initial page loading.

Validation recorded for this worktree:

- `cd server && npm run lint && npx prisma validate` — passed.
- `cd server && npm run build` — passed.
- `cd desktop && npm exec -- tsc --noEmit && npm run build:renderer` — passed.
- `node --check desktop/electron/main.js` and `node --check desktop/electron/preload.cjs` — passed.
- `git diff --check` — passed.

The local database was unreachable during the offset-aware runtime attempt. The Phase 3 migration therefore still needs deployment and the full/incremental sync behavior still needs database-backed runtime testing.

## 8. Current Verification and Next Actions

At the end of the coding work, the user said they would perform Phase 4 testing. Phase 4 is mainly deployment, measurement, and operational validation—not a pre-planned feature phase—though any measured bottleneck could justify follow-up code/config work.

Before treating the work as fully verified:

1. Confirm the intended terminal count (three initial estimate versus five clients listed in the audit).
2. Verify the server's actual `DATABASE_URL` and apply the reviewed Phase 3 migration to the intended database:

   ```sh
   cd server && npx prisma migrate deploy
   ```

3. Exercise catalog full sync, incremental stock/price changes, product archive, daily reconciliation, and offline cached lookup; test multiple windows on the same machine.
4. Runtime-check dashboard/report date boundaries and figures against known records in the business timezone.
5. Manually test dashboard, report filtering/table/export, checkout and arrears, returns, receipts/printer, and server-disconnection behavior.
6. Measure on the deployment server and all intended LAN clients with realistic data and concurrent use. Record warm/cold conditions, query/API/UI timings, CPU, memory, disk, and network.
7. Review PostgreSQL/server configuration and backups on the actual deployment machine. Do not present synthetic local measurements as deployment results.

Phase 4/real-hardware validation has **not** been completed by this work. The user is expected to test it. No commits were created as part of this conversation.

## 9. Documentation and Source Pointers

- [performance.md](./performance.md) — baseline, phase details, measurements, and checklists.
- [EFFICIENCY.md](./EFFICIENCY.md) and [PERFORMANCE_REVIEW.md](./PERFORMANCE_REVIEW.md) — prior performance recommendations and audit material.
- [server/src/modules/reports/reports.service.ts](./server/src/modules/reports/reports.service.ts) — dashboard and report aggregates.
- [server/src/modules/medicines/medicines.service.ts](./server/src/modules/medicines/medicines.service.ts) — compact product catalog synchronization.
- [server/prisma/schema.prisma](./server/prisma/schema.prisma) and [server/prisma/migrations/](./server/prisma/migrations/) — schema and migrations.
- [desktop/src/lib/sync.ts](./desktop/src/lib/sync.ts) and [desktop/src/lib/localDb.ts](./desktop/src/lib/localDb.ts) — client catalog cache.
- [desktop/src/App.tsx](./desktop/src/App.tsx) and [desktop/vite.config.ts](./desktop/vite.config.ts) — lazy route loading and build chunking.

