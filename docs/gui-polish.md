# GUI polish — 2026-10-15

The user approved the GUI review and its proposed fixes. Theme work is saved separately on `ohmattpon/themes`; this branch starts from `main` and changes GUI presentation and query feedback only.

## Behavior

- Today distinguishes initial loading, request failure, successful empty results, and failed refresh with cached data. A failure offers retry and never implies that no sales exist.
- Owner totals use one compact strip, with the sales ledger as the main content. Owner-only totals remain owner-only.
- Today panels and product tiles use smaller corners and fewer shadows, without changing shared Panel defaults.
- Cart clear and sheet close controls have 44px targets. The sheet close control belongs to the cart header, avoiding an absolutely positioned control over cart actions.
- Tablets retain the existing cart sheet and bottom total until runtime evidence supports changing the breakpoint.
- All added user-facing text has Thai and English translations.

## Verification

Run root typecheck and test, web build and lint, and screenshots at phone, short phone, tablet and desktop sizes. Verify initial sales/summary failures, retry recovery, cart sheet close, visible payment controls and horizontal overflow using the screenshot harness. Inspect generated images by eye. No API contract or checkout calculation changes are planned.

Validated: root typecheck; API 967 tests and web 108 tests; web build and lint (5 existing lint warnings); OpenAPI v1/v2 baselines unchanged. The screenshot harness passed all four sizes, including initial request failure, retry recovery and cart close target checks. Phone, tablet and desktop Today images and the phone cart sheet were inspected visually. Evidence is in the ignored `screenshots/` folder of this worktree.
