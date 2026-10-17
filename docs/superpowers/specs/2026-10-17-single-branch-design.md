# One branch only

Date: 2026-10-17
Branch: `ohmattpon/single-branch`

## Why

The shops that use this system have one shop each. Branches are not a problem for them, but they are not needed. The project owner decided the system has exactly one branch, and branches disappear from what anyone sees or does.

## What the owner decided

- The system has one branch only. A second branch cannot be created.
- **Option A:** remove branches from what users see and do, and keep one fixed branch inside. Not option B (dropping the `branches` table and every `branch_id` column), which would break API v1 and need destructive migrations.
- The one branch is the first one, code `MAIN`. Every request works in it.
- Data that already belongs to other branches (the demo seed has a second branch) stays in the database untouched: not deleted, not merged. It is no longer reachable from the system. Merging stock and bills across branches was rejected because of the risk to money and receipt numbers.
- `seed-demo.ts` is changed to create one branch. Existing demo databases are reseeded by the owner if wanted; this project does not touch them.
- `AGENTS.md` is updated to match (its "Branches" section describes multi-branch rules).
- Unfinished work in other branches (a paid QR with no bill, a QR with an unknown outcome, a quote reserved by a QR, an open shift) also becomes unreachable. The owner accepted this because only demo databases have a second branch. `AGENTS.md` records it as an explicit exception to the QR money rule: it applies only to branches other than `MAIN` that existed before this change. No startup check is added.

## Goals

- No screen shows a branch: no branch page, no branch switcher, no branch field in the user form, no branch scope or per-branch section in reports, no branch column in the audit log, no branch name in the members history panel, no "first branch name" field on the setup page.
- The API cannot create a second branch, and every request works in `MAIN` whatever the user's `branchId` or the `X-Branch-Id` header says.
- The `MAIN` branch can never be closed, because closing it would stop the whole shop.
- Nothing that sells, counts stock, numbers receipts or runs shifts changes its rules.

## Non-goals

- No change to tables or columns: `branches`, `branch_stock`, the `branch_id` columns and the receipt counter stay. No migration that drops or rewrites data.
- No merging or moving of other branches' data into `MAIN`.
- No new API version. Changes to v1 are limited to what the contract rules allow (see "API contract").
- No change to receipt numbering: the prefix stays `MAIN`.

## Anti-goals (a failure even if it works)

- A sale, stock movement or shift ends up in a branch other than `MAIN`.
- A user who was assigned to another branch can no longer sign in or sell.
- The shop stops working because its one branch was closed.
- A receipt number repeats or changes format.
- An old bill shows different header details than it was printed with.

## Server

### Branch resolution

`ResolveBranchUseCase` always returns the `MAIN` branch:

- The `X-Branch-Id` header and the user's `branchId` are ignored. (I decided ignoring beats rejecting: old web tabs that remember another branch id keep working, in `MAIN`.)
- `BRANCH_FORBIDDEN` and `BRANCH_INACTIVE` can no longer occur from resolution. `BRANCH_NOT_FOUND` stays for a database without `MAIN` (a broken install).
- A database where `MAIN` was closed would stop selling with no screen left to reopen it, so a new migration sets `is_active = true` on the `MAIN` row (one-row, additive-safe update). (My call.)
- The branch repository port gains `findMain()` (by code `MAIN`). The migration that introduced branches created `MAIN` in every database, and `seed.ts` already relies on it.

### Branch commands

- `POST /api/v1/branches` stays in the contract but always answers `409` with a new code `SINGLE_BRANCH_ONLY` (translated in `src/locales/errors.ts`). The route is not removed, because removing a route is a breaking change in v1.
- `PATCH /api/v1/branches/{id}` refuses `isActive: false` for `MAIN` with a new code `MAIN_BRANCH_REQUIRED`. Editing other fields stays allowed, but nothing in the web calls it any more.
- `GET /api/v1/branches` is unchanged. The web calls it in one place only: the receipt, for old bills that were sold before the header snapshot existed (`receiptHeading` falls back to the bill's branch for name, address and phone). (My call.)
- The route guards stay as they are (`branches.manage` on `POST` and `PATCH`); see "Permissions".

### Users

- `branchId` stays in the user model and the API, and new users get `MAIN`. The create and update inputs make `branchId` optional (a relaxed requirement, allowed in v1), defaulting to `MAIN`. Existing users keep whatever `branchId` they have; since resolution ignores it, they work in `MAIN`.

### Permissions

- `branches.manage` and `branches.switch` **stay** in `PERMISSION_GROUPS` and in the API. Removing them would make role create/update reject them (`INVALID_ROLE`), a tightening that breaks v1, and would break the code that checks them. (My call, changed after review.)
- The web role editor hides these two permissions, so nobody sees them. Their meaning is now moot: switching is ignored by resolution, and creating a branch always fails.

### Setup

- `branchName` in `POST /api/v1/setup` becomes optional (relaxed, allowed in v1). When it is missing, the `MAIN` branch name is set to the shop name. The setup page stops asking for it.

### Reports

- The "all branches" scope and the per-branch report (`list-report-branches`) are no longer used by the web. The routes stay in v1 and keep working; with one branch in use they return the same totals as `MAIN`, apart from the hidden data of other branches, which "all branches" would still include. (Acceptable: the web never asks for it.)

### Receipts

- `SaleCheckout` keeps storing the header snapshot, but for new bills stores `branchName: null` and takes `shopAddress` and `shopPhone` from shop settings only (today it prefers the branch's address and phone). So a new receipt has no branch line, and its address and phone are the ones the owner can still edit in `/settings`. Old bills keep what they were sold with. (My call, after review: the branch form is gone, so a branch address could never be changed again.)
- Check for the owner: an abbreviated Thai tax invoice may need a "head office / branch" mark. This design prints none, as today's receipts do when the branch name equals the shop name. If the owner needs one, it belongs in shop settings, not in a branch.

### Seed

- `seed-demo.ts` creates only `MAIN` and its register, people and data. Everything it put in the second branch moves to `MAIN` in the script, or is dropped where it only existed to show two branches.

## Web

- Remove the `branches` feature's page, route, sidebar item, switcher, form dialog, `useActiveBranch` and the `active-branch` store, and the `x-branch-id` header in `lib/api.ts`. Callers that need "the branch" for keys (registers, reports, member history) stop passing a branch id; where a query key carried the branch id, it drops it.
- The users page and form lose the branch column and field.
- Reports lose the scope select and the per-branch section, and the Excel export loses the branch sheet or column.
- The audit page drops the branch column.
- The members history panel drops the branch name from its description.
- The setup page drops the "first branch name" field.
- The role editor hides the two branch permissions (their translations stay, since the API still returns them).
- Locale keys that only served branches are removed from `locales.ts` files.
- `bun run e2e` drops `/branches` from its page list and the setup step that fills the first branch name.

## API contract

Every API change is additive or relaxing (allowed in v1): new error codes on existing routes, and optional `branchId` and `branchName`. No route, field or permission is removed. `POST /branches` now always fails, which is a behavior change on an existing route; the owner accepted it by choosing one branch only. The project owner is told before `server/test/openapi-baseline.json` is recorded again, as `AGENTS.md` requires.

## Testing

- `ResolveBranchUseCase`: returns `MAIN` with no header, with another branch's id, and for a user assigned elsewhere; `BRANCH_NOT_FOUND` when there is no `MAIN`.
- `CreateBranchUseCase`: always `SINGLE_BRANCH_ONLY`.
- `UpdateBranchUseCase`: refuses closing `MAIN`; allows other changes.
- User create without `branchId` gets `MAIN`. Setup without `branchName` names `MAIN` after the shop.
- `SaleCheckout`: a new bill stores `branchName: null`.
- Integration: a user whose `branchId` is another branch sells, and the bill, stock movement and receipt number are `MAIN`'s.
- Existing tests that exercise multiple branches are rewritten or removed with the feature they test. No test is edited just to make a change pass; each removed test is named in the commit body with the reason.
- Web: `bun run typecheck`, `bun run lint`, `bun run test:web`; `bun run test` and `bun run e2e` on the throwaway database (run by the owner).

## Left to the builder

- The order of commits, as long as each one leaves the app working.
- Whether `findMain()` caches (the row never changes once installed).
- How to split `seed-demo.ts` data that belonged to the second branch.
- Which dead files and exports go, as long as nothing still imports them.
