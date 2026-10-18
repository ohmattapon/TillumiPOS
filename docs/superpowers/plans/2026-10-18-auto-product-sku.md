# Automatic product SKU Implementation Plan

**Goal:** Generate product SKUs at save time while preserving manual codes.
**Architecture:** Product command uses repository ports and a PostgreSQL sequence;
domain formatting stays pure. Web omits blank creation SKUs.
**Tech Stack:** Bun, PostgreSQL, Drizzle, Elysia, React, TanStack Query.
**Spec:** `docs/superpowers/specs/2026-10-18-auto-product-sku-design.md`

## Constraints and review focus

Use branch `ohmattpon/auto-product-sku`, gitcz only. No merging or opening PRs.
Preserve existing SKUs, audit atomicity and stock. Sequence gaps are legitimate.
Check manual collisions, concurrent requests, blank update rejection, codes beyond
six digits and allocation reads bypassing cache. Announced API change is additive.

## Task 1: Server allocation

Files: product repository port, Drizzle and cached adapters, product use case and
schemas, mocks, product schema and generated migration, domain SKU formatter.

- [x] Add failing unit tests for omitted SKU, manual preservation and collisions.
- [x] Add `nextSkuNumber(): Promise<number>` and `skuExists(sku: string): Promise<boolean>`.
  The allocator holds the catalog SKU advisory lock until transaction completion;
  create/update take that same lock. Cache adapter delegates directly.
- [x] Add domain `formatProductSku(number)` and sequence migration.
- [x] Generate inside command's unit of work, skipping codes already present.
- [x] Make creation SKU optional in Zod/HTTP, retaining nonempty update validation.
- [x] Add integration tests for parallel allocation, collisions and unchanged edits.
- [x] Run focused tests and record results.

## Task 2: Web and verification

Files: product api.ts, ProductFormDialog.tsx, locales.ts, OpenAPI baselines.

- [x] Allow optional SKU input; omit blank creation SKU, retain required edit input.
- [x] Add Thai/English placeholder and help text explaining generation on save.
- [x] Update contract snapshots after checking only intended changes.
- [x] Run typecheck, all tests, OpenAPI, screenshots and inspect responsive images.
- [x] Review diff, record unavailable checks accurately, commit using gitcz.

Execution is sequential in the current chat, following the user's approval.

## Verification results

All implementation and review steps above are complete. `bun run typecheck`,
`bun run test` (1548 API and 341 web tests), `bun run openapi:check`, and
`bun run screenshots` pass. Lint exits successfully with existing warnings.
Viewed the new creation form at 390, 390x500, 768 and 1366 pixels; browser checks
created a product without SKU at each size and verified its generated code.

The first full test run had one intermittent 401 in the existing branch-list test.
That file passed all 11 tests in isolation, and the complete suite passed on rerun.
The screenshot fixture initially affected the next viewport's catalogue; each
created fixture is now disabled after verification, and the full screenshot run passes.

Migration generation included already-applied manual migrations 0021/0022; removed
their duplicate DDL from 0023, retaining the corrected current schema snapshot.
Set 0023's journal timestamp after 0022 because the generated timestamp was earlier
and PostgreSQL otherwise skipped the new migration. Fresh disposable database
migrations and existing test database upgrades were exercised successfully.

Runtime verification used only the disposable `pos_test` and `pos_e2e_shots`
databases. The configured development database was not migrated during that
verification; the owner subsequently requested and applied the original 0023.

## Integration with main (2026-10-18)

Resolved conflicts against `origin/main` at `736df4c` on the feature branch.
Preserved product classification, the cafe form's editable CAFE code prefill,
both sets of product integration tests, and server generation for omitted SKUs.
The cafe explanation has its own translation key so the normal creation hint
still explains generation on save.

Main now owns migrations 0023-0026. Renumbered the SKU migration to
`0027_auto_product_sku`, with a timestamp after both main and the original SKU
ledger entry. The sequence is created only when absent. This migration also
reuses main's idempotent modifier-default and product-type repairs because an
installation of the original SKU branch skips main's earlier timestamps.
No counter is reset and an existing product classification is preserved.

Added disposable-database regression tests for upgrades from main and the
original SKU branch, sequence continuity, and repeated repair. Scoped the
existing product-type migration suite to migrations through 0026 so its ledger
assertions remain unchanged when later feature migrations are added.

Deployments should apply 0027 rather than the historical 0023 SKU file. The
configured development database was not changed while resolving these conflicts.

Merge verification: typecheck, OpenAPI, lint, and the full test command passed
(1621 API tests and 362 web tests). Focused product/migration tests passed 68
cases. The first concurrent full run timed out in the repository secret scan;
the isolated scan and the complete rerun passed without changing its assertions.

E2E returned 40 passed / 3 failed on both the merged feature tree and a separate
checkout of unmodified main `736df4c` with its own installed dependencies:
the customer-display check rejects the existing display-slides API read, and
the two 768px checks time out waiting for the sell heading during sign-in.
Those baseline failures are retained; this integration does not change those
screens or their assertions. The cafe creation/default-code checks pass on both.

The complete screenshot command passed on rerun. Inspected the new product form
at 390, 390x500, 768 and 1366px with main's classification field present; each
viewport created a product with an omitted SKU and verified the generated code.
The first concurrent screenshot run timed out in the English report calendar;
the final full run completed without changing those assertions.
