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

## 10. Business-Logic Hardening

The user asked for a product/business-logic audit and approved implementing the suggested fixes. The confirmed return policies are:

- Apply return value to the original invoice's outstanding arrears first; refund any remaining eligible amount in cash.
- Keep returned medicine quarantined until an authorized inspection decision.
- Allow an explicitly unknown expiry date rather than inventing one.

The current worktree implements:

- Product edits no longer overwrite inventory quantity or expiry.
- Sales validate invoice arithmetic and require a customer when any invoice balance remains unpaid. Checkout atomically guards product and batch stock, rejects expired lots, allocates stock by FEFO with unknown-expiry batches last, and records the sale-time purchase cost.
- Purchase edits/removals/restores preserve inventory consistency and reject reversal when stock has already been consumed. Selected price tiers are validated as belonging to the purchased product.
- Arrear payments use the shared transaction-scoped sale ID allocator, preserve partial status, record initial partial-sale collections in the payment history, and protect financial history from deletion.
- Returns derive line values from the original sale, prevent over-return, reconcile return value against arrears and collected cash, and quarantine inventory. Inspected items can be restocked to their original eligible batch (or an unknown-expiry return batch) or disposed.
- Sales/dashboard/report figures exclude arrear payment receipts, net return values, and use sale-time costs for profit calculations. Return profit adjustments account for sales tax and whether inspection restored the returned item's cost to inventory. Customer purchase counts and last-purchase dates exclude arrear payment receipts.
- The Returns UI and printed return receipts show the refund/arrears-credit/cash-refund breakdown and support inspection disposition.

Schema changes are in `server/prisma/migrations/20261102110000_reconcile_inventory_and_returns/migration.sql`. After the user authorized deployment to the development database, the migration was applied to PostgreSQL database `faraz-pharmacy` at `localhost:5432`; `prisma migrate status` confirmed the database is up to date. It makes batch expiry nullable, classifies arrear payment receipt sales, adds sale-time costs and return settlement/quarantine fields, and backfills legacy sale-item costs from batch/product costs. Existing return items are marked as already restocked to avoid adding their stock twice. Historical return settlement splits are not reconstructed, and legacy sale costs are best-effort where no batch cost was recorded.

Key implementation files include:

- `server/src/modules/sales/sales.service.ts` and `sales.schema.ts` — invoice validation, stock allocation/decrement, sale cost snapshots, payment receipt-history rows.
- `server/src/modules/sales/sales-id.ts` — shared PostgreSQL advisory-lock allocator for sale and arrear receipt IDs.
- `server/src/modules/purchases/purchases.service.ts` — stock-safe purchase edit/remove/restore and product-specific price-tier checks.
- `server/src/modules/returns/returns.service.ts` — source-invoice valuation, repeat-return accounting, arrears/cash reconciliation, quarantine and inspection disposition.
- `server/src/modules/arrears/arrears.service.ts` — serialized payments, payment receipt classification, partial status, and financial-history deletion safeguards.
- `server/src/modules/reports/reports.service.ts` and `customers.service.ts` — exclude receipt-only sales from purchase metrics, net returns in revenue, and use recorded sale costs for profit.
- `desktop/src/pages/Returns.tsx`, `desktop/src/lib/api.ts`, `desktop/src/types/index.ts`, and `desktop/electron/printer.js` — return terminal, inspection actions, API types, and receipt settlement breakdown.

Verification performed after the final code changes:

- `cd server && npm run lint` — passed.
- `cd server && ./node_modules/.bin/prisma validate --schema prisma/schema.prisma` — passed.
- `cd server && npm run build` — passed after applying the migration to the confirmed development database.
- `cd server && ./node_modules/.bin/prisma migrate status` — database up to date.
- `cd desktop && npm exec -- tsc --noEmit && npm run build:renderer` — passed.
- `node --check desktop/electron/printer.js` and `git diff --check` — passed.
- Prisma Client generation — succeeded after the schema changes.

The migration was applied only to the confirmed local development database; no production/LAN database was touched. No full manual POS/LAN workflow test has been performed. Manual follow-up should cover: partial/full arrears collections and receipt history; sales with exact, insufficient, and split FEFO batch stock; expired and unknown-expiry batches; return value against remaining arrears versus already-collected cash; repeated/over-quantity returns; quarantine, restock, and disposal; purchase reversal after stock consumption; and sales/report totals after receipts and returns. Sale price overrides remain possible; whether checkout must enforce configured price tiers was not established as policy and should be decided separately.

## 11. POS Price-Tier Selection and Product/Stock Review

The user clarified that the POS price picker should retain both the product's `Standard` sale price and configured tier prices. The cashier should see sale prices only, and once a product is already in the active cart, selecting/scanning that same product again should add one unit at its existing cart price without reopening the picker.

Implemented in the current worktree:

- The POS picker is titled “Choose sale price” and displays the Standard price and each configured tier's sale price. It does not show purchase prices; those remain internal cost values.
- A tiered product in search results is marked “Price options” instead of presenting the product-level Standard price as if it were the only choice.
- Existing cart rows are reused on repeat selection, preserving the first chosen unit price. Removing the row and selecting the product again allows a new price choice. Cart choice is independent per active sale.
- Barcode lookup returns the configured tiers through both Socket.IO and REST fallback, matching the IndexedDB and typed-search paths. Tier options are sorted consistently by creation time and ID. Tier records with generic legacy “Standard” labels display as Price 1, Price 2, etc.
- Product and tier price inputs reject negative values server-side and set a nonnegative minimum in the product form.
- Product tier replacement and product hard deletion now run transactionally so a failed update/delete does not leave tiers/barcodes partially removed.

No Prisma schema or migration change was needed for this work. Server type-check and build, desktop type-check and renderer build, the exact advisory-lock query against the local development database, and `git diff --check` passed. Manual testing is still needed for choosing Standard versus each tier through typed search, local barcode lookup, Socket.IO scan, and REST scan; repeated selection within the same cart; and switching between multi-sale carts.

The user later provided the complete checkout error: Prisma `P2010` / `UnsupportedNativeDataType`, “Failed to deserialize column of type 'void',” originating in `nextSaleId`. PostgreSQL `pg_advisory_xact_lock(...)` returns `void`, which Prisma `$queryRaw` tried to deserialize. The allocator now calls the same transaction-scoped lock through `$executeRaw`, avoiding result-column deserialization while keeping the lock semantics. The exact `$executeRaw` lock query succeeded in a transaction against the configured local development database. This was not the earlier missing-column `P2022`; no migration was needed or run for this error. Restart the API process to load the fix.

Stock review also found a valuation edge case not changed here: editing an existing stock purchase's selected price tier updates the purchase record, while its linked batch's stored purchase cost remains unchanged. Since one batch can aggregate multiple stock purchases, updating the batch cost from one edited purchase could misstate other stock; defining the desired cost-layer/valuation behavior is needed before changing this path.

## 12. POS Availability and Global Search Review

The user reported that a product could intermittently appear out of stock after selecting it and searching for it again. The review found two stale-result paths:

- POS typed search could keep showing results for the previous input during the 100 ms debounce and while fresh results were loading. Pressing Enter during that interval could select a stale result.
- Barcode lookup returned IndexedDB stock before checking the server. That local catalog is refreshed periodically, so stock changes from another LAN terminal could leave barcode results outdated.
- Global Search used the same debounced-result timing issue and the default 30-second query freshness, allowing stale stock labels after another terminal changed inventory.

Implemented:

- POS typed search now hides results until they correspond to the current input and the latest request finishes. Enter during a pending search fetches the current query before selecting.
- Barcode lookup now uses live Socket.IO/REST stock first and uses IndexedDB only when the server is unavailable. Socket acknowledgement and REST barcode requests have bounded timeouts to prevent scans from hanging while offline.
- Global Search suppresses results from the prior query while input is debouncing or data is refreshing, refreshes on window focus, and labels tiered products as “Price options” instead of showing the Standard price as the only price.
- Completing a sale invalidates the POS and global-search product query caches.
- Multi-sale cart state now clamps discounts to the subtotal (or 100% for percentage discounts) and disallows negative tax values, including when a cart is reduced after a discount was entered.

No schema or migration change was needed. Remaining business-rule caveat: product-level `stock_qty` can diverge from currently sellable batch quantity (for example expired-only batches or pre-existing inventory reconciliation errors). Checkout applies stricter batch and product guards than the search labels, so a separate stock reconciliation/available-quantity policy may be needed if those cases occur. Manual testing should include repeated typed searches while typing quickly, barcode scans after another terminal sells or receives stock, a disconnected server/cache fallback, discounts after removing cart lines, and final checkout with low or expired-batch inventory.

## 13. Sale Price Must Exceed Purchase Price

The user reported that the product form accepted sale prices below purchase cost and requested a strict rule: every configured sale price must be greater than its corresponding purchase price.

Implemented in the current worktree:

- The product form validates the base price and each additional price tier as the user edits them, shows an inline error when a positive sale price is equal to or below cost, and disables save while such an error exists.
- Blank or zero sale price continues to mean “calculate automatically.” The form now explains this behavior.
- CSV import preview marks rows with invalid sale prices, including sale prices equal to or below purchase cost.
- The product API schema enforces the comparison for base and tier prices, so non-UI clients cannot submit an invalid explicit price.
- Automatic sale-price calculation now guarantees a value strictly above cost even when rounding would otherwise make the computed amount equal to cost.
- Stock receipt rejects a product or selected legacy tier whose stored sale price is not above purchase cost, with a message to correct product pricing first.

No Prisma schema or migration change is needed. Existing legacy products/tiers are not bulk-modified; edit and save them with valid prices before receiving stock against an invalid product/tier. Validate with server type-check/build, desktop type-check/renderer build, and `git diff --check`. Manual verification should include explicit lower/equal prices, valid prices, blank/zero automatic prices (including very small costs), CSV rows with invalid prices, and stock receipt for a legacy invalid tier.

## 14. POS Search Reusing Old Stock Results

The user reported that a product with 12 units could be added to the cart, then show zero stock when searched again.

The POS search used a 100 ms debounced query key based only on the debounced text. Clearing the search after selecting a product and retyping the same text before the debounce timer elapsed could leave the query key unchanged, causing the old cached result to be reused without a new request.

Implemented in the current worktree:

- Added a search-session component to the POS product-search query key. Starting a new search after clearing the input now uses a fresh key even if the debounce value still matches the previous search.
- The Enter-key fetch uses the same query key as the visible search results.
- If an availability refresh fails, the POS now hides any old cached results and displays a clear inline refresh error instead of presenting stale stock as current.

Validation passed: desktop TypeScript check, renderer production build, and `git diff --check`. A live browser check could not be completed because the local API at `localhost:3001` refused the connection when the shared app page was opened. Manual POS verification should add/select a product, immediately retype the same search before the debounce settles, and confirm the result refreshes with current stock; also test another terminal receiving/selling stock and a disconnected API.

## 15. Stock Receipt Price Selection

The user reported that the stock-receipt price selector showed only one configured price when a product had both its base prices and an additional price tier. The requested UI is a simple two-column list with Purchase and Sale values and no “Standard” or tier names.

Implemented in the current worktree:

- The stock-receipt price dropdown now includes the product’s base purchase/sale prices plus every configured tier.
- Choices are displayed as rows under Purchase and Sale columns; tier names are omitted.
- If no previous stock entry has a still-configured tier, the base product prices are selected by default. A previous valid tier remains the default when present.
- Editing an existing stock entry can select the base-price row; the API update now resolves that explicit null tier choice to the product’s base prices and validates the pair.

No schema or migration change is needed. Verify with a product that has only base prices, one with base plus multiple tiers, and editing a tier-priced stock entry to choose the base row. Desktop TypeScript/renderer build and server TypeScript/build checks are required; live UI verification depends on the local API being available.

## 16. Company Dialog Spacing

The user reported spacing issues in the Add Company dialog.

The dialog header uses the shared component's horizontal inset, but the form lacked horizontal and bottom padding. This misaligned the company field and action buttons against the title and left the footer crowded against the dialog edge.

Updated the form to align with the header's horizontal padding, added balanced vertical spacing, and separated the action row with a subtle divider and consistent top padding. Desktop TypeScript check, renderer build, and `git diff --check` passed.

## 17. PostgreSQL Grouping Error in Dashboard Stats

The user reported Prisma `P2010` / PostgreSQL `42803` in `reportsService.getStats`: `s.created_at` was selected as a timezone-adjusted calendar day, but the query repeated the expression in `GROUP BY` and `ORDER BY`. Prisma binds each interpolated timezone offset as a separate SQL parameter; PostgreSQL therefore did not see the selected and grouped expressions as identical.

Changed both the dashboard daily-revenue query and the sales-summary daily-revenue query to group and order by the selected first column (`GROUP BY 1 ORDER BY 1`). This preserves the computed local calendar-day grouping and ISO date ordering while avoiding parameter-expression mismatch. No migration or database modification is required. Validate with server TypeScript/build and `git diff --check`; runtime verification needs the local database/API available.

## 18. POS Stock Availability Reads

The user reported that POS search and repeated barcode scans could say “Out of stock” despite stock being available. The POS typed-search API reads the product list, whose server service caches full product records—including `stockQty`—for 60 seconds. Barcode fast lookup reads the database directly, but Enter handling could also treat an exact barcode in list results as authoritative.

Implemented:

- Added a `freshStock` option to the product-list request. POS search and Enter-key search set it, making the API bypass both reads and writes to the server's product-list cache for those requests. Other product list consumers retain existing caching.
- Exact barcode matches from search results now get verified through the live barcode lookup rather than using cached quantity.
- Stock receipt now invalidates the product cache after its database transaction commits (and emits its stock event only after commit), preventing a concurrent read from repopulating cache with pre-commit quantity.

No schema or migration change is needed. Validate server/desktop type-check and builds plus `git diff --check`. Runtime verification requires the user's configured database and should cover adding stock, immediate typed search, immediate repeated barcode scans, and stock changes made on another terminal.

## 19. Global Search Stock Availability

The user reported that Global Search showed every product as out of stock even when inventory existed.

Global Search used a separate `/api/products/search` endpoint with a 30-second server cache, so it did not use the fresh-stock list option used by POS. Its empty-query suggestions also came from a cached sample and were not explicitly refreshed when the input was focused.

Updated Global Search to use the paginated products API with `freshStock: true` for both typed results and suggestions. Focusing the bar now refetches the suggestion sample. No migration is needed. Validate desktop type-check/renderer build and `git diff --check`; confirm live stock readings with the user's active API/database.
