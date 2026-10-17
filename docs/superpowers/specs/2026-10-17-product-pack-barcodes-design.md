# Pack barcodes: one product, several barcodes

Date: 2026-10-17
Branch: `ohmattpon/product-pack-barcodes`

## Why

TillumiPOS is a system many shops choose from, and the owner wants retail shops (grocery stores, minimarts) to be its main audience. In those shops the same goods carry more than one barcode: a can of soft drink has its own barcode, the box of 6 has a different one printed on the box, and the case of 24 another. Today a product has exactly one barcode, so scanning the box at the till answers "product not found".

The owner wants the till to behave like a convenience-store chain: scan the box, and the cart gets "soft drink, pack of 6" at the pack price, while stock goes down by 6 cans.

This is also the foundation of the next feature, receiving stock by scanning (a separate branch and design), which reuses the same "this barcode = N pieces" data.

## Goals

- A product can have extra **packs**. A pack has its own barcode, a size (how many pieces of the product it holds, at least 2) and an optional price.
- **Pack price is optional.** Left empty, the pack sells at `size × product price`, always using the product's current price. Filled in, the pack sells at that price, which is usually a little cheaper (the owner agreed to this, on Claude's recommendation).
- Scanning a pack barcode at the POS puts the pack into the cart as its own line. Scanning it again adds one more pack.
- **The receipt shows the pack**, for example `Soft drink (pack of 6) × 1 … 85.00`, not 6 separate cans (agreed).
- **Stock is always counted in pieces.** Selling 1 pack of 6 takes 6 out of stock, voiding the bill puts 6 back. There is no stock per pack.
- A shop that never adds a pack sees no change and no extra step anywhere, and scanning stays as fast as today.
- Barcodes stay unique across the whole shop: a barcode belongs to at most one product or one pack.

## Non-goals

- Receiving stock or counting stock by scanning. That is the next branch.
- Weighed or price-embedded barcodes (EAN-13 starting with `2`).
- Typing a quantity before scanning (`5*` then scan).
- Scanning with a phone camera, printing barcode labels.
- Quantity promotions ("buy 6 for X"). Promotions stay bill-level discounts. A pack price is not a promotion and does not interact with the promotion rules beyond being part of the subtotal.
- Packs in table orders (`orders`). Retail sells in one step; orders keep adding lines by `productId` as today.
- Packs with modifier options. A pack line carries no options.
- Pack images, pack names shown on the product grid, or picking a pack by tapping. Packs are reached by scanning only: a pack barcode typed in the search box and confirmed with Enter goes through the same exact lookup as a scan. The free-text `q` filter of the products list does not change. *(Claude's call: smallest change to the v1 contract.)*

## Anti-goals (would be a failure even if it works)

- Stock that drifts because a pack was deducted as 1 piece, or a void that returns the wrong number.
- The screen showing a different total from the receipt. Totals still come from `calculateTotals`, which must not change.
- An existing client of v1 breaking. Everything is additive.
- An old receipt changing because a pack was later edited or disabled.

## How it behaves

### Managing packs (back office)

- Packs are edited in the product form, in a "Packs" section under the existing barcode field. Each row: barcode, size, price (empty = auto), active. Rows can be added and disabled. A pack that has been sold cannot be deleted, only disabled (soft-disable, as for other things that history points to). A pack that was never sold may be deleted. *(Claude's call: same rule as the rest of the catalog.)*
- Permission: `products.write`, the same as editing the product. No new permission.
- Changing packs is audited with the product, through `IAuditLog.record` in the same unit of work.
- The existing `products.barcode` stays as the barcode of a single piece. It keeps its meaning and its place in the v1 contract.
- Rules, enforced in the domain (entity or value object):
  - barcode 1–64 characters, same rule as the product barcode
  - size is an integer from 2 to 9999 *(upper bound is Claude's call)*
  - price, when set, is integer satang ≥ 0 and ≤ `MAX_AMOUNT_SATANG`
  - at most 10 packs per product *(Claude's call, bounds input)*
  - a barcode may not equal any product barcode or any other pack barcode, active or not. A clash answers `DomainConflictError` with a stable code (for example `BARCODE_TAKEN`) and `params.barcode`.

### Selling

- The POS search box already treats Enter as a scan. A scan looks up the code against product barcodes, then pack barcodes, then SKU (today's order, with packs inserted after product barcodes).
- A pack hit adds a cart line keyed by product **and** pack. The same product scanned as a single piece is a different line. The cart keeps only `productId`, `packId` and quantity; name, size and price are read from queries at render time, per the state rules.
- An inactive pack, or a pack of an inactive product, is refused like an inactive product today.
- A product whose stock is tracked is checked against its **total pieces in the cart**, counting `quantity × size` for pack lines plus single lines (the rule "stock is checked against the product's total, not per line" extends to packs).
- The line's unit price is the pack price, or `size × product price` when the pack has none. The line's unit cost is `size × product cost`. Both are snapshotted on the bill.
- The checkout item accepts an optional `packId`. A pack item with `options` is rejected (`INVALID_SALE` or a dedicated code).
- A pack line still goes through `resolveLineOptions` (via `ILineOptionsResolver`), with no options. So a pack of a product that has a required modifier group cannot be sold: the sale is refused with the resolver's existing error, and the web shows it on scan. No exception is added to the option rules, and no check is added when creating a pack or attaching a group. The owner chose this; it is rare in retail.
- Quotes pin pack lines like any other line: pack id, size, label, unit price. A sale with a `quoteId` uses the pinned values even if the pack was edited or disabled since.
- The customer display shows the pack the same way the cart does.

### On the bill

- A bill line records the pack as a snapshot: `packId` (nullable), `packSize` (1 for a normal line). Nothing about a pack is read from the current catalog to show an old bill.
- `quantity` on a pack line is the number of packs. Stock movements use `quantity × packSize` pieces.
- The receipt and the bill detail show `name (pack of N)`. The label text is translated on the web from `packSize`.
- Voiding a bill returns `quantity × packSize` pieces through `IStockLedger`.
- Any report or summary that counts "items sold" for a product counts pieces (`quantity × packSize`). *(Claude's call: stock and reporting speak the same unit.)*

## Constraints

- Hexagonal + CQRS per AGENTS.md. The pack rules live in the domain, once. Selling still goes through `ISaleCheckout`, so money, stock, VAT and receipt rules stay in one place.
- Stock changes only through `IStockLedger`, with a movement per change.
- Migration is additive: a new table for packs, new nullable/defaulted columns on bill lines and quote lines (`pack_size` default 1). Existing rows mean "no pack".
- v1 contract: only new optional fields and new routes. `bun run openapi:check` will show the additions; tell the project owner before recording the baseline.
- New error codes get a translation in `src/locales/errors.ts`. New UI text goes through `t()` in the feature's `locales.ts` (Thai and English).
- The product form must still work at 390, 768 and 1366 px; touch targets 44 px.
- Tests: domain tests for the pack rules, use case tests with mock ports for create/update with packs, checkout with packs (price, cost, stock deduction, stock check across lines, inactive pack, pack with options), void, quote pinning; integration tests over HTTP for the routes and a pack sale end to end; web unit tests for the cart key and the pack line price.

## Left to the builder

- Whether packs are stored in their own table (`product_packs`) with the product barcode kept on `products`, or all barcodes move into one table. Either way the uniqueness rule across products and packs must hold under concurrent edits (a unique index, or a lock taken in a fixed order), and the v1 `barcode` field keeps working.
- The exact route shape: nested in the product payload (`packs: [...]` on create/update and in the response) or separate routes. Prefer whatever keeps the product form a single save.
- How the scan lookup returns a pack hit (for example the existing `code` search returning the product plus `matchedPackId`, or a dedicated lookup route).
- Where the pack price fallback (`size × price`) is computed so that the web and the server share one pure function (as `@pos/api/pricing` does).
- Exact error codes, as long as they are stable and translated.
