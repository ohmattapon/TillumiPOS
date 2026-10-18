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
- [ ] RED: domain/use-case tests and targeted HTTP regression tests.
- [ ] GREEN: implement domain normalization, ports, adapters, commands/queries and schema.
- [ ] Verify focused tests; report exact API types and error details to web lane.
Risk: generated migration/snapshot ownership is exclusively server lane.

### Task 2: Web

Owner files: src/features/stock-receipts/**; ProductsPage receive navigation/locales;
app routes/sidebar/bottom navigation/i18n/locales; src/locales/errors.ts.
REQUIRED SUB-SKILL: superpowers:test-driven-development.
- [ ] RED: pure durable-draft tests with injected storage and UUID creation.
- [ ] GREEN: draft UI, remote product lookup, submission/query hooks and history/detail.
- [ ] Verify web tests and types after server contract is present.
Risk: no deep imports across features, no server details persisted as client state.

### Task 3: Integrate and validate

Owner: root; e2e scripts and these documents, OpenAPI baseline after announced review.
- [ ] Read both lanes' changes; verify rollback, retry uncertainty and actor scoping.
- [ ] Test focused new paths, then `bun run typecheck`, `bun run test`, lint/OpenAPI.
- [ ] Add real browser checks for reload/retry and receipt history at supported sizes.
- [ ] Run screenshots, inspect current images; record baseline failures separately.
- [ ] Stage reviewed files only, commit with gitcz; report exact evidence/limitations.
