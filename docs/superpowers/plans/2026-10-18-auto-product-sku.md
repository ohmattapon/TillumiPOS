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

- [ ] Add failing unit tests for omitted SKU, manual preservation and collisions.
- [ ] Add `nextSkuNumber(): Promise<number>` and `skuExists(sku: string): Promise<boolean>`.
  The allocator holds the catalog SKU advisory lock until transaction completion;
  create/update take that same lock. Cache adapter delegates directly.
- [ ] Add domain `formatProductSku(number)` and sequence migration.
- [ ] Generate inside command's unit of work, skipping codes already present.
- [ ] Make creation SKU optional in Zod/HTTP, retaining nonempty update validation.
- [ ] Add integration tests for parallel allocation, collisions and unchanged edits.
- [ ] Run focused tests and record results.

## Task 2: Web and verification

Files: product api.ts, ProductFormDialog.tsx, locales.ts, OpenAPI baselines.

- [ ] Allow optional SKU input; omit blank creation SKU, retain required edit input.
- [ ] Add Thai/English placeholder and help text explaining generation on save.
- [ ] Update contract snapshots after checking only intended changes.
- [ ] Run typecheck, all tests, OpenAPI, screenshots and inspect responsive images.
- [ ] Review diff, record unavailable checks accurately, commit using gitcz.

Execution is sequential in the current chat, following the user's approval.
