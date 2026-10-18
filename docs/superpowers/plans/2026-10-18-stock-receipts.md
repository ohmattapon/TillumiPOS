# Stock Receipts Implementation Plan

**Goal:** Reliable batch stock receiving with recoverable drafts and receipt history.
**Touches:** API, database, web, browser checks.
**Spec:** `docs/superpowers/specs/2026-10-18-stock-receipts-design.md`

Current single-item receives have no durable retry key or receipt document. Add
the approved document flow and preserve existing v1 contracts. Migration timestamps
must follow 0027 (1792328900001); never run tests against configured shop database.
Use branch ohmattpon/stock-receipts, gitcz only; no main pushes or PR creation.

Parallel-first: independent server and web lanes share the exact API contract in
the spec. Spawn separate sub-agents for these lanes. Root owns integration/e2e,
documentation, review, final validation and commits; workers do not commit/push.

| Task | Can run together | Must wait for | TDD slice |
|---|---|---|---|
| API/domain/database | Web implementation | Written contract | Duplicate normalization, atomic rollback, concurrent identical keys, replay/conflicting key, permissions, branch scope, snapshots, overflow |
| Web and draft | API implementation | Written contract; API needed for final typecheck | Persist/reload uncertain draft, frozen retries, confirmed/failed outcomes, actor separation, corruption/storage failures |
| Integration/browser/review | None | Both lanes | Single/batch receiving, refresh/retry, history, responsive screenshots, existing contracts |

### Task 1: Server

Owner files: server/src/domains/stock-receipt*, server/src/modules/stock-receipts/**,
schema/stock-receipts.ts, schema/stock-movements.ts and index; inventory ledger
receipt linkage types; app.module.ts, di-registrations.ts; server tests/mocks;
drizzle migration and metadata. REQUIRED SUB-SKILL: superpowers:test-driven-development.
- [x] RED: domain/use-case tests and targeted HTTP regression tests.
- [x] GREEN: implement domain normalization, ports, adapters, commands/queries and schema.
- [x] Verify focused tests; report exact API types and error details to web lane.
Risk: generated migration/snapshot ownership is exclusively server lane.

### Task 2: Web

Owner files: src/features/stock-receipts/**; ProductsPage receive navigation/locales;
app routes/sidebar/bottom navigation/i18n/locales; src/locales/errors.ts.
REQUIRED SUB-SKILL: superpowers:test-driven-development.
- [x] RED: pure durable-draft tests with injected storage and UUID creation.
- [x] GREEN: draft UI, remote product lookup, submission/query hooks and history/detail.
- [x] Verify web tests and types after server contract is present.
Risk: no deep imports across features, no server details persisted as client state.

### Task 3: Integrate and validate

Owner: root; e2e scripts and these documents, OpenAPI baseline after announced review.
- [x] Read both lanes' changes; verify rollback, retry uncertainty and actor scoping.
- [x] Test focused new paths, then `bun run typecheck`, `bun run test`, lint/OpenAPI.
- [x] Add real browser checks for reload/retry and receipt history at supported sizes.
- [x] Run screenshots, inspect current images; record baseline failures separately.
- [x] Stage reviewed files only, commit with gitcz; report exact evidence/limitations.

## Verification record (2026-10-18)

- `bun run test`: API **1650 passed, 0 failed** (141 files); web **373 passed,
  0 failed** (50 files). API run includes real PostgreSQL integration tests.
- New receipt coverage: 20 API unit tests, 9 HTTP integration tests, 11 web
  draft/quantity tests. Integration covers concurrent identical/distinct keys,
  normalized duplicate rows, payload conflict, all invalid product ids, integer
  overflow, audit-failure rollback, permission denial, immutable snapshots,
  pagination, branch scoping and replay after stock tracking changes.
- `bun run typecheck`, `bun run build`, `bun run lint`, `bun run openapi:check`
  passed. Lint reports existing shared-component warnings; build reports existing
  bundle size/dynamic import warnings.
- OpenAPI diff reviewed before baseline replacement: only new
  `/api/v1/inventory/receipts/` and `/api/v1/inventory/receipts/{id}` paths. v2
  baseline and all prior v1 paths remain unchanged.
- `bun run e2e:stock-receipts` passed against its own
  `pos_e2e_stock_receipts` database. Browser lets the API commit, drops the
  response, refreshes, then retries the same key/body. Confirms exactly one
  receipt, stock increment and movement per product; also checks immediate
  draft-edit reload, incomplete quantity editing, confirmed reload without
  automatic submission, history details and actor-isolated drafts.
- Browser screenshots/overflow checks cover 390x844, 390x500, 768x1024 and
  1366x900 in draft, uncertain, confirmed and history states. Draft-bottom
  screenshots prove save/note controls remain reachable on short phones.
- `bun run screenshots` passed for all four sizes. Inspected the new receipt
  images by eye, including populated history and short-phone draft controls.
- Broad `bun run e2e`: **40 passed, 3 failed**, matching the pre-feature baseline
  previously reproduced on unmodified main `736df4c`. Existing failures are the
  customer-display assertion forbidding its `/api/v1/display-slides` request,
  and two tablet checks timing out at sign-in (768px page overflow and sell-screen
  touch targets). Existing assertions were not weakened. The receipt-specific
  browser suite independently checks receipt overflow at every required size.
- Browser review caught and fixed an asynchronous edit-persistence race, then
  verified immediate refresh retains the note. Quantity input now accepts a
  temporary blank while blocking submission; blur restores the saved value.
  Mobile receipt details label received quantity and remaining stock separately.
- Secret scanner re-run after staging both new server and web files: 5 passed.
- Implementation commits: `560a6ba` (API/database), `2685069` (web/browser tests).

Configured shop database has **not** been migrated or seeded. Deployment needs
migration `0028_stock_receipts` before starting this release. Stock-count
sessions and a separate movement-history UI remain outside this increment.
