# Automatic product SKU

Approved behavior: creation without a SKU generates `SKU-000001`, then increasing
numbers, with at least six digits. Manual SKU entry remains available. Existing
products and edit validation retain their current behavior. The web omits blank
creation SKUs and explains that the code appears when saved.

The command allocates through the product repository port inside its audited unit
of work. A dedicated PostgreSQL sequence provides numbers; gaps are allowed after
rollbacks. A transaction advisory lock shared by allocation, product creation and
product updates prevents manual SKU writes racing allocation. Allocation checks
existing codes without case sensitivity and skips occupied codes. Formatting
belongs to a pure domain function. Queries never allocate numbers.

Creation HTTP schemas make SKU optional without accepting an explicitly empty
string. Existing requests and response shapes remain compatible. Update still
requires a nonempty SKU when supplied. No account, inventory or price behavior changes.

Validate formatting, omission/manual entry, skipped collisions, parallel creation,
manual conflicts, audit rollback and edit preservation. Run typecheck, all tests,
OpenAPI check, and responsive screenshots where infrastructure is available.
