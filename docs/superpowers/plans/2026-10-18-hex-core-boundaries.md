# Guarded Order Repository → Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `ORDER_LOCKED_BY_QR_PAYMENT` business rule out of the adapter layer into the orders core, so the decorator lives in `orders/applications/` wrapping `IOrderRepository`.

**Estimated tasks:** 1 | **Estimated time:** ~30 min | **Touches:** API server only (`server/src/modules/orders`, `server/src/modules/quotes` untouched)

## Current Problem / Current Solution

`GuardedOrderRepository` lives in `server/src/modules/orders/adapters/repository/guarded-order.repository.ts` and enforces a business rule in `save()`: an order whose price a QR is waiting on cannot be written (`lock.assertEditable(order.id)`). Per AGENTS.md ("Decorators are allowed on both sides, for their own side's concerns" + known deviation), a decorator that enforces a business rule must live in the core (`applications/`), wrapping the port — not in `adapters/`. The throw itself already lives in the core (`quotes/applications/services/order-edit-lock.ts`), but the enforcement point (the decorator) does not, so the deviation is still open.

## Proposed Approach

Create a core decorator in `server/src/modules/orders/applications/` (e.g. `applications/decorators/guarded-order.repository.ts`) implementing `IOrderRepository`, injecting the inner repository through a new inner token plus `IOrderEditLock`. Rebind the composition root (`orders.module.ts`) so the public `orderRepositoryToken` resolves to the core decorator and the inner token resolves to `DrizzleOrderRepository`. Delete the adapter decorator (or leave it only if something still imports it — verification step confirms nothing does). Move/rename the unit test to the core path. No behavior change: same rule, same error code, same pass-through for reads and new orders.

## Side by Side

| Scenario | Before | After |
| -------- | ------ | ----- |
| Save order with no QR hold | Adapter decorator calls `lock.assertEditable`, then inner `save` | Core decorator calls `lock.assertEditable`, then inner `save` (same observable behavior) |
| Save order with QR hold | Adapter decorator throws `ORDER_LOCKED_BY_QR_PAYMENT`, inner `save` never called | Core decorator throws `ORDER_LOCKED_BY_QR_PAYMENT`, inner `save` never called |
| Import direction | Core rule enforced by a file under `adapters/` | Rule enforced by a file under `applications/` importing only ports + domains |
| DI wiring | `orderRepositoryToken → GuardedOrderRepository (adapters)` | `orderRepositoryToken → core decorator`, inner token → `DrizzleOrderRepository` |

## Assumptions & Risks

- **Assumed:** Nothing outside `orders.module.ts` and its test imports `GuardedOrderRepository` directly (grep showed only those two; worker re-verifies before deleting).
- **Assumed:** tsyringe can register `DrizzleOrderRepository` under a plain string inner token alongside the existing class binding — same pattern as other `container.register(<token>, { useClass: <Drizzle*> })` lines.
- **Assumed:** `DrizzleOrderRepository` constructor needs no special binding beyond default injectable resolution (today it is injected as a class directly, so registering it under a string token with `useClass` must still resolve its own deps — worker verifies with the test + typecheck).
- **Risk:** If the inner-token registration fails at runtime (DI resolution error), every order command breaks — mitigated by running the moved unit test plus a DI smoke (import `orders.module` / resolve `orderRepositoryToken`) before finishing.
- **Risk:** Deleting the adapter file breaks an import the grep missed — mitigated by a repo-wide grep for `guarded-order.repository` before deleting, and by keeping the change to one concern so revert is trivial.

## Impact

- Closes one documented known deviation in AGENTS.md (the `guarded-order.repository.ts` row).
- Core rule becomes testable without adapters (unit test moves to `applications/`, constructs decorator over `mockOrderRepository` + fake lock).
- No API contract change, no migration, no web change.
- Out of scope (explicitly NOT in this plan): `console` in auth/qr usecases, `crypto.randomUUID` id generation, `setTimeout` in display stream, adapter cross-module presenter/schema imports, sales→settings port import. Each is a separate concern with its own design decision; see follow-ups below.

---

## Task Overview

> **For implementation tasks:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before editing production code. Each task is a RED -> GREEN -> REFACTOR slice.
> **Parallel-first:** Single task — no parallelization. Only one behavior slice exists; everything touches the same DI binding and the same test.

1. **[Move GuardedOrderRepository to orders core]** - Lane A | Can run together: none | Must wait for: none | TDD slice: moved failing test on new path -> core decorator + rebind -> delete adapter file + verify

---

### Task 1: Move GuardedOrderRepository to orders core

**Files:**

- Create: `server/src/modules/orders/applications/decorators/guarded-order.repository.ts` (name may adjust to match reviewer; must live under `applications/`, implement `IOrderRepository`, wrap inner via new inner token + `orderEditLockToken`)
- Modify: `server/src/modules/orders/orders.module.ts:29` (bind public token to core decorator, inner token to `DrizzleOrderRepository`)
- Modify: `server/src/modules/orders/applications/ports/order.repository.ts:26-27` (add inner token export next to `orderRepositoryToken`, same `Symbol(...).toString()` idiom) — alternatively declare the inner token in the decorator file if reviewer prefers; one place only
- Test: move `server/src/modules/orders/adapters/repository/guarded-order.repository.test.ts` → alongside the new decorator (e.g. `server/src/modules/orders/applications/decorators/guarded-order.repository.test.ts`), updating imports to the new path and to `mockOrderRepository`/`makeOrder` (no Drizzle import; inner typed as `IOrderRepository`)
- Delete: `server/src/modules/orders/adapters/repository/guarded-order.repository.ts` (+ old test path) after the new binding resolves

**Parallelization:**

- Can run with: `none`
- Must wait for: `none`
- Race risk: `none` (single task; owns the orders DI binding and the guarded test exclusively)

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code. This task must follow RED -> GREEN -> REFACTOR. No commit or push from this task (owner handles branches/PRs; branch is `ohmattpon/hex-core-boundaries`).

- [ ] **Step 1: Write the failing test**

Copy the existing test to the new core path first (imports pointing at the new decorator path that does not exist yet), keeping all three cases: writes-through with `assertEditable(4)`, refuses locked order with `code: 'ORDER_LOCKED_BY_QR_PAYMENT'` and inner `save` not called, new order (`id: 0`) skips the lock and reads pass through. Inner is `mockOrderRepository()` typed as `IOrderRepository` — no `DrizzleOrderRepository` import in the test.

```ts
// new path, e.g. applications/decorators/guarded-order.repository.test.ts
guarded = new GuardedOrderRepository(inner /* IOrderRepository */, lock)
await expect(guarded.save(makeOrder({ id: 4 }))).rejects.toMatchObject({ code: 'ORDER_LOCKED_BY_QR_PAYMENT' })
expect(inner.save).not.toHaveBeenCalled()
```

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

Run the most targeted command from `server/` (API tests preload `test/setup.ts` via `server/bunfig.toml`): `bun test src/modules/orders/applications/decorators/guarded-order.repository.test.ts`. Expected result: FAIL because the new module path does not exist yet — not because of setup or import errors in the test harness itself.

- [ ] **Step 3: Implement the minimal code**

Create the core decorator: same four pass-throughs (`create`, `findById`, `findByIdForUpdate`, `findAll`) and the same `save` guard (`if (order.id !== 0) await this.lock.assertEditable(order.id)`). Constructor injects the inner `IOrderRepository` via the new inner token and `IOrderEditLock` via `orderEditLockToken`. Imports only `tsyringe`, `domains/order.domain`, and the two ports — never `adapters/`, `libs/`, or `infrastructure/`. Then rebind `orders.module.ts`: register the inner token with `{ useClass: DrizzleOrderRepository }` and point `orderRepositoryToken` at the core decorator. Run repo-wide grep for `guarded-order.repository` to confirm only the module (now updated) and tests reference it, then delete the adapter file + old test.

- [ ] **Step 4: Run the test and confirm it passes**

Run the same targeted test command. Expected result: PASS, all three cases, no new warnings. Then run the wider orders suite (`bun test src/modules/orders`) and `bun run typecheck` from the repo root. Expected result: PASS with no unrelated failures (a failure in an unrelated suite stops the task — report it, do not fix it here).

- [ ] **Step 5: Refactor only after green**

Refactor only after the targeted test is green. Allowed: naming/placement of the inner token to match reviewer idiom, comment wording on the decorator (keep the existing "why" comment — it explains the rule). Keep behavior unchanged and rerun the targeted test after the refactor. Do NOT bundle: logger ports, id-generator ports, scheduler ports, presenter/schema import cleanup, or the AGENTS.md deviation-table edit (docs follow-up for the owner).

## Verification (task exit criteria)

- [ ] New core test passes: `cd server && bun test src/modules/orders/applications/decorators/guarded-order.repository.test.ts`
- [ ] Orders suite passes: `cd server && bun test src/modules/orders`
- [ ] Typecheck passes: `bun run typecheck` (repo root)
- [ ] No remaining references: `grep guarded-order.repository` hits only the new core files (plus this plan)
- [ ] Diff touches only: new decorator + test, `orders.module.ts`, `order.repository.ts` (inner token), deleted adapter files

## Follow-ups (out of scope, one plan each)

- Logger port for `console` in `login`/`set-own-pin`/`switch-user` usecases + `qr-payment-refresher` (AGENTS.md deviation row 2).
- Id-generator port for `crypto.randomUUID` in `set-product-image`, `set-promotion-image`, `create-qr-payment`, `create-qr-payment-v2` (deviation row 3).
- Scheduler/wait port for `setTimeout` in `open-display-stream` (deviation row 4).
- Adapter cross-module imports: orders→sales presenter/schema, auth→users schema, sales→settings port — each needs a consumer-owns-port or shared-response decision.
- `node:crypto` `createHash` in `shared/applications/command-idempotency.ts` — deterministic hash, but still a Node API in core; decide port vs. accept.
- Docs: update the AGENTS.md deviation table row 1 after this plan ships (owner decision; not part of the code task).
