# Faraz Pharmacy Agent Guide

Before making project changes, read [script.md](./script.md) for the conversation history, architectural decisions, completed performance work, verification results, and outstanding checks. Then consult the relevant project documentation and source files.

## Project Overview

- This repository contains an Electron desktop POS (`desktop/`) and an Express/TypeScript API with Prisma and PostgreSQL (`server/`).
- Client machines connect over the local wired LAN to the machine hosting the API and database. Internet access is not part of normal application operation.
- Product and stock lookups require the API and are not persisted locally. Do not assume sales or checkout can safely complete while disconnected; the agreed operating model requires the server.
- Backend features are organized under `server/src/modules/`; follow the existing route/controller/service/schema patterns.
- The renderer uses React, TypeScript, Vite, React Router, and TanStack Query. Electron main-process and preload code live in `desktop/electron/`.
- Review [server/README.md](./server/README.md), [desktop/README.md](./desktop/README.md), [performance.md](./performance.md), [EFFICIENCY.md](./EFFICIENCY.md), and [PERFORMANCE_REVIEW.md](./PERFORMANCE_REVIEW.md) when relevant. Treat implementation and migration files as authoritative if older documentation differs.

## Working Rules

- Inspect the current worktree before editing. Preserve unrelated or pre-existing changes; do not reset, revert, or overwrite work you did not make.
- Never run `git push`, `git pull`, `git commit`, or other commands that change remote or commit history. Read-only commands such as `git status` and `git diff` are okay. Ask the user before any Git operation that publishes or records changes.
- Make focused changes that preserve existing user-facing behavior. Update directly related documentation when behavior, deployment, or migration requirements change.
- Database schema changes require a Prisma migration under `server/prisma/migrations/` and matching schema updates. Regenerate Prisma Client when needed.
- Never execute database migration, reset, schema-push, or deployment commands, including `npx prisma migrate dev`, `npx prisma migrate reset`, `npx prisma db push --force-reset` (sometimes mistakenly written as `migrate push --force-reset`), `npx prisma migrate deploy`, or package scripts that invoke them. Do not apply migrations to any database. Prepare and review migration files, explain the exact command and target environment, and leave execution to the user unless they explicitly authorize a specific operation and database.
- For database features, check both the API and every desktop call site. Preserve pagination, filtering, and multi-window behavior.
- Do not add secrets or machine-specific credentials. Never include `.env` contents in logs, examples, or documentation.
- Avoid claiming performance gains from local SQL timings as LAN or production results. Record the workload, client count, hardware, and cache conditions for benchmarks.
- Keep checkout correctness and transactional stock behavior ahead of speed optimizations.
- Use the smallest relevant validation commands, and report commands that could not run separately from those that passed.

## Common Validation Commands

Run commands from the corresponding package directory:

```sh
# Backend type-check, Prisma schema validation, and production build
cd server && npm run lint
cd server && npx prisma validate
cd server && npm run build

# Renderer type-check and production bundle
cd desktop && npm exec -- tsc --noEmit
cd desktop && npm run build:renderer

# Electron syntax checks (when main/preload code changes)
node --check desktop/electron/main.js
node --check desktop/electron/preload.cjs

# Check patch formatting from repository root
git diff --check
```

The server's `lint` script runs TypeScript checking. Do not imply that a dedicated test suite ran unless it was actually run.

## Documentation and Deployment Cautions

- Treat [performance.md](./performance.md) as the current performance audit, implementation log, and status source. [PERFORMANCE_REVIEW.md](./PERFORMANCE_REVIEW.md) and [EFFICIENCY.md](./EFFICIENCY.md) are prior review/recommendation documents; consult them for context, but do not assume their recommendations remain outstanding or their findings describe the current code.
- Deploy server and desktop updates together when API response shapes, pagination limits, or product/stock lookup behavior changes; older clients can otherwise show partial data or fail against new APIs.
- Before starting a server build that depends on a new schema field, tell the user which reviewed migration must be applied and confirm the intended database/`DATABASE_URL` with them. Do not apply it or point commands at an assumed database.
- Validate dashboard/report date behavior using the pharmacy's confirmed business timezone and correct workload. Do not assume the machine timezone matches the business timezone.
- Manual testing on the target server and all intended LAN terminals is distinct from type-checking/building and must be reported as such.
