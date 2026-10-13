# Cash shift cutover

The migration creates a `MAIN` register for each existing branch and a new branch receives one in its create transaction. It does not open shifts or change old sales. `CHECKOUT_MODE` defaults to `legacy` in `.env.example`.

## Current implementation boundary

- `legacy`: existing v1 checkout and QR behavior remains active. Shift opening and v2 checkout are blocked.
- `shifts`: v2 cash/card sale and order checkout require an open shift; the selected register is scoped to the signed-in user and branch. The web POS blocks payment until it sees an open shift.
- v1 money commands for sale, order payment, void, and QR create/cancel are retired in `shifts` mode. Existing read routes and the SCB confirmation callback remain.
- Web cash refunds are recorded as a one-time cash outflow in an open same-branch shift after a sale is voided.
- Bank QR works in `shifts` mode through `/api/v2/payments/qr`: each request is recorded before the bank is called, an unknown outcome is kept until someone checks it with the bank, and paid money without a sale is listed for the branch until it is sold or an owner dismisses it. **This has been tested against a fake SCB only. Make one real payment in your own environment before relying on it.**
- A shift cannot be counted while it has a QR request with an unknown outcome or paid money without a sale. QRs still waiting to be paid need an acknowledgement, because counting does not cancel them at the bank.
- The shift report is frozen when counting starts and is not rewritten afterwards; sales voided later are listed beside it. Shift history and detail are on the shift page.
- Not verified in a browser yet: run the two-session checks of the design (two accounts in one shift, counting started on another till) before going live.

## Before enabling shifts

1. Back up PostgreSQL and verify the backup can be restored.
2. Apply migrations and confirm each branch has exactly one active `MAIN` register.
3. Inventory all clients and move money commands to `/api/v2`; v1 money commands return `API_VERSION_RETIRED` after activation.
4. Reconcile pending, paid, and unclaimed QR payments before cutover. QR payments made in legacy mode have no origin shift; paid ones without a sale appear in the v2 unclaimed list and can be sold in the first shift or dismissed by an owner.
5. Enable `CHECKOUT_MODE=shifts` only after the shop has reviewed the client migration and refund/closing procedures.

The mode is deployment-wide. The first successfully opened shift writes a permanent activation marker; switching the environment back to `legacy` afterwards does not restore v1 money commands. A schema migration does not enable shifts. Keep a copy of the v1 and v2 OpenAPI snapshots with the deployment release.
