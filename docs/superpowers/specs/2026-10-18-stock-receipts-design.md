# Batch stock receipts and durable retry

User-approved first increment: receive multiple products atomically, reuse
CommandIdempotency, persist the client draft and key across reloads, and view
receipt history/details. Separate movement-history UI and stock-count sessions
remain later increments. A future count baseline must be captured when the user
presses Start counting, and intervening movements require reconciliation/recount.
No cost averaging, suppliers, recipes, lots or expiry in this increment.

## Contract

All routes use `/api/v1/inventory/receipts` and `inventory.receive` permission.
POST accepts `Idempotency-Key` UUID and JSON
`{ items: [{ productId: positiveInteger, quantity: positiveInteger }], note?: string }`.
Limit 100 input rows, note 500 characters. Combine duplicate product ids and sort
by id before hashing/locking. Quantities and resulting stock must fit PostgreSQL
integer; report all invalid product ids before making any writes. Disabled
products may be received, consistent with the old receive command, but stock
tracking is required. Validate actor permission inside commands too.

Receipt response (POST and GET /:id):
`{ id, branchId, receivedById, receivedByName, createdAt: ISOString, note: string|null,
items: [{ productId, sku, name, quantity, balanceAfter }] }`.
Names/SKUs and actor display name are immutable snapshots at receipt time.
GET list accepts limit (default 25/max 100), offset, and returns `{ items, total }`.
List items use the same response shape initially: each receipt has at most 100
items, and page defaults to 25 receipts. All reads are branch-scoped pure queries.

Store stock_receipts and stock_receipt_items; stock_movements gains nullable
receipt_id for new receipt writes. Preserve existing movement HTTP responses and
old v1 receive API. Reuse IStockLedger; receipt code never updates inventory tables
directly. One UoW wraps idempotency lock -> product row locks sorted by id ->
receipt -> movements/items -> audit -> command receipt. Replay restores the original
receipt without generating stock changes or another audit event. Same key plus a
different canonical request is a conflict. Existing actor/action/branch scoping of
CommandIdempotency remains in force.

API errors: STOCK_RECEIPT_NOT_FOUND and STOCK_RECEIPT_INVALID_ITEMS. Invalid items
include `params.productIds` as comma-separated numeric ids for row highlighting;
Thai detail explains the rejected items. Do not use HTTP validation `errors` for
domain failures. Add English translation for both codes.

## UI and draft lifecycle

Feature `stock-receipts`, routes `/stock-receipts` (history) and
`/stock-receipts/new` (draft), detail via selected receipt/dialog. Product search
uses existing server-side product query (bounded results, no client scan of an
entire catalogue). Rows combine duplicates, quantities stay integer, note optional.
The old products Receive action navigates to the new draft with productId as an
optional preselection. Adjust remains unchanged. Add navigation for permitted staff.

Draft is scoped by signed-in user and browser origin. Persist only ids, user-entered
quantities/note, UUID, submission status/frozen input and confirmed receipt id;
read current product details through TanStack Query. Generate key when a new draft
begins, never per click/retry. Persist frozen payload before starting HTTP; reload
of submitting state is uncertain and must retry the identical payload/key. Disable
edits and new draft while outcome is unknown. Explicit validation failures permit
editing; network/5xx outcomes stay uncertain. Success persists the receipt id and
shows the receipt. A new key is created only for an explicit new receipt after a
confirmed result or intentional discard of an unsent draft. Handle corrupt or
unavailable storage visibly; do not silently lose a possibly submitted draft.
Keep drafts of different users separate and never render another actor's draft.

All copy uses Thai/English locales, all tables DataTable with priorities, 44px
controls, 390/768/1366px layouts. Query errors are visible and retryable. No changes
to existing count semantics in this increment.
