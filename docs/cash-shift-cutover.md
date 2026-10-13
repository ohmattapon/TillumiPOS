# Cash shift cutover

The migration creates a `MAIN` register for each existing branch and a new branch receives one in its create transaction. It does not open shifts or change old sales. `CHECKOUT_MODE` defaults to `legacy` in `.env.example`.

## Current implementation boundary

- `legacy`: existing v1 checkout and QR behavior remains active. Shift opening and v2 checkout are blocked.
- `shifts`: v2 cash/card sale and order checkout require an open shift; the selected register is scoped to the signed-in user and branch. The web POS blocks payment until it sees an open shift.
- v1 money commands for sale, order payment, void, and QR create/cancel are retired in `shifts` mode. Existing read routes and the SCB confirmation callback remain.
- Web cash refunds are recorded as a one-time cash outflow in an open same-branch shift after a sale is voided.
- **Do not activate `shifts` for a shop that needs bank QR checkout yet.** Durable shift-bound QR attempts, explicit inquiry/recovery routes, and paid-unclaimed recovery UI are not implemented. The web client disables configured bank QR in this mode. No bank transaction has been tested by this implementation.
- Full closed-shift detail/history views and frozen tender/sales closing summaries also remain to be completed.

## Before enabling shifts

1. Back up PostgreSQL and verify the backup can be restored.
2. Apply migrations and confirm each branch has exactly one active `MAIN` register.
3. Inventory all clients and move money commands to `/api/v2`; v1 money commands return `API_VERSION_RETIRED` after activation.
4. Reconcile pending, paid, and unclaimed QR payments before cutover. Do not enable shifts for a QR-dependent shop until durable QR recovery ships.
5. Enable `CHECKOUT_MODE=shifts` only after the shop has reviewed the client migration and refund/closing procedures.

The mode is deployment-wide. The first successfully opened shift writes a permanent activation marker; switching the environment back to `legacy` afterwards does not restore v1 money commands. A schema migration does not enable shifts. Keep a copy of the v1 and v2 OpenAPI snapshots with the deployment release.
