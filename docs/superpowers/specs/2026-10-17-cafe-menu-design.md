# Cafe menu starter set (ชุดเมนูคาเฟ่ให้เลือก)

Date: 2026-10-17
Branch: `ohmattpon/cafe-menu`

## Why

A shop that picks "café" at first-run setup gets an empty till. Before it can sell one drink the owner has to create a category, type every drink twice (hot and iced), build the sweetness group, build the toppings group, attach both groups to every drink, and get twenty prices right. That is the first hour of a new shop, and it is the hour where mistakes stick: two drinks that should share a topping group end up with two groups, and the sweetness choices differ between drinks.

The shop-type spec deliberately left data creation out ("No starter data. The owner chose hiding menus over seeding data."). This spec changes that decision for one case only, and keeps the reason behind it: **nothing appears on its own**. The owner opens one dialog on the products page, ticks the drinks they sell, and confirms. Only what was ticked is created.

The second half is a change to the modifiers feature. A café records the same answer on almost every drink ("หวานปกติ"). Making the cashier tap it on every cup adds a tap to the busiest screen in the shop, so an option can now be marked **ค่าเริ่มต้น** (default): the options dialog opens with it already chosen, the cashier confirms with one tap, and the choice is recorded on the bill exactly like a choice they made by hand.

## Goals

- One dialog on `/products` ("เพิ่มจากชุดเมนูคาเฟ่") and the same dialog as the empty-state action, so a new café finds it on the page it will already open.
- The owner ticks whole categories or single items; the server creates the missing categories, products, groups and options in one transaction with one audit entry.
- Retrying is safe: an existing category or group is reused by name, an existing product is skipped and never overwritten, and the answer reports what happened ("เพิ่ม 18 ข้าม 4").
- An option can be marked as the group's default, and the sell screen starts with it chosen.

## Non-goals

- **No bakery / food set, no second set.** Drinks only. A second set is a later decision with its own content.
- **No sizes.** `modifier_options.priceSatang` cannot be negative (DB check `modifier_options_non_negative` + `isMoney` in the entity), so a size group could only ever add money. A shop that wants sizes sets the product price to its smallest size and adds the larger sizes as priced options (e.g. base 60 for M, option "L +10"). Recorded here so nobody "fixes" it later into a discount.
- **No images, no cost, no barcode, no stock counting.** Every created item has `costSatang = 0`, `barcode = null` and `trackStock = false`, so the whole set is sellable the moment it is created and no tile is ever greyed out. Counting is turned on per item later through `StockDialog` / the `IStockLedger`.
- **No new permission, no new sidebar entry, no new page, no `GET` route.** The content is a shared constant, so there is nothing to fetch.
- **Not offered to retail or restaurant types.** The button is on the products page for every shop; the shop type does not gate it. (A café set on a minimart menu is the owner's own mistake to make, and gates would need to read the shop type, which setup deliberately does not store.)

## Amends

- `2026-10-16-shop-type-setup-design.md`: the non-goal "**No starter data.** Choosing a type does not create categories, products, modifier groups or tables." is replaced by: **setup still creates no data**; a separate dialog on the products page creates only what the owner ticks. The switch model, `shopFeaturesFor(type)` and "a switch hides screens only, it never blocks the API" are untouched.
- `2026-10-14-modifiers-design.md`: out-of-scope "ตัวเลือกที่ติ๊กไว้ล่วงหน้า" is now in scope as an option flag (`is_default`). The selection rules in `resolveLineOptions` are unchanged: a default is a choice the web pre-makes and sends, not a rule the server applies behind the cashier's back.

## The set (content, for the owner to approve)

Two categories, twenty items, two option groups. Prices are a starting point in the middle of the market, not a claim about the owner's shop; they are set at creation and are editable per item on the products page.

Every item: `trackStock = false`, `costSatang = 0`, `barcode = null`, `isActive = true`. The SKU is the item key used by the API and the dialog.

### หมวด `กาแฟ`

| Item | SKU | Price (baht) |
|---|---|---|
| เอสเปรสโซ่ร้อน | `CAFE-ESP-HOT` | 45 |
| อเมริกาโน่ร้อน | `CAFE-AME-HOT` | 45 |
| อเมริกาโน่เย็น | `CAFE-AME-ICE` | 55 |
| ลาเต้ร้อน | `CAFE-LAT-HOT` | 55 |
| ลาเต้เย็น | `CAFE-LAT-ICE` | 65 |
| คาปูชิโน่ร้อน | `CAFE-CAP-HOT` | 55 |
| คาปูชิโน่เย็น | `CAFE-CAP-ICE` | 65 |
| มอคค่าร้อน | `CAFE-MOC-HOT` | 60 |
| มอคค่าเย็น | `CAFE-MOC-ICE` | 70 |
| คาราเมลมัคคิอาโตร้อน | `CAFE-CAM-HOT` | 65 |
| คาราเมลมัคคิอาโตเย็น | `CAFE-CAM-ICE` | 75 |

### หมวด `ชาและโกโก้`

| Item | SKU | Price (baht) |
|---|---|---|
| ชาไทยร้อน | `CAFE-TEA-HOT` | 45 |
| ชาไทยเย็น | `CAFE-TEA-ICE` | 55 |
| ชาเขียวร้อน | `CAFE-GRN-HOT` | 45 |
| ชาเขียวเย็น | `CAFE-GRN-ICE` | 55 |
| ชามะนาวเย็น | `CAFE-LEM-ICE` | 50 |
| มัทฉะลาเต้ร้อน | `CAFE-MAT-HOT` | 60 |
| มัทฉะลาเต้เย็น | `CAFE-MAT-ICE` | 70 |
| โกโก้ร้อน | `CAFE-COC-HOT` | 50 |
| โกโก้เย็น | `CAFE-COC-ICE` | 60 |

### กลุ่มตัวเลือก

| Group | required | maxSelections | Options | Offered on |
|---|---|---|---|---|
| `ความหวาน` | no | 1 | หวานปกติ (**default**, +0), หวานน้อย (+0), หวานมาก (+0), ไม่ใส่น้ำตาล (+0) | every item |
| `ท็อปปิ้ง` | no | 3 | วิปครีม (+10), ช็อตเอสเพรสโซ่เพิ่ม (+15), ไซรัปคาราเมล (+10) | the `กาแฟ` items only |

Drinks are split hot / iced into separate products because they are priced differently and the sell screen shows a price on the tile; a single "อเมริกาโน่" tile would have to show one price and open a dialog on every cup. What does not change the price stays a group (sweetness), and what adds money stays a priced group (toppings). `ความหวาน` is not required, so "หวานปกติ" is the shop's standard and only an exception is chosen — the default makes that exception one tap away without forcing a tap.

## Data and domain

### New: `server/src/domains/cafe-menu.domain.ts`

Pure, no framework imports, shared with the web through the `@pos/api` alias so the dialog and the server can never disagree about the set or its prices.

- `CAFE_MENU_CATEGORIES: readonly CafeMenuCategory[]` — `{ key, name, sortOrder }`.
- `CAFE_MENU_OPTION_GROUPS: readonly CafeMenuOptionGroup[]` — `{ key, name, required, maxSelections, sortOrder, options: { name, priceSatang, costSatang, sortOrder, isDefault }[] }`.
- `CAFE_MENU_ITEMS: readonly CafeMenuItem[]` — `{ key /* the SKU */, name, categoryKey, priceSatang, optionGroupKeys }`.
- `cafeMenuItem(key)` / `cafeMenuItemsFor(keys)` — lookups that never throw.
- `planCafeMenu(items: readonly CafeMenuItem[], existing: { categoryNames, groups, products })` — the one rule for add-or-skip, returning `{ toCreate: { categories, items, groups }, toReuse: { categories, groups }, toSkip: { items } }` where matching is **category and group by name (trimmed, case-insensitive)**, and **product by SKU first, then by trimmed / case-insensitive name**. Used by the use case to decide and by the dialog to preview, so both sides answer the same question the same way.

Item names are data (Thai product names stored in the database), not i18n keys: the dialog shows the same names in both languages, like the demo catalog seed does. The dialog's own labels go through `t()`.

### Changed: `server/src/domains/modifier.domain.ts`

- `ModifierOptionProps` gains `isDefault: boolean` (normalized to `false` when absent, so a 30-second-old read cache cannot break the entity).
- `OptionData` picks up `isDefault`.
- New pure `defaultOptionIds(groups: readonly ModifierGroupWithOptions[]): number[]` — the ids the sell screen should start with: for each active group, the first active option flagged `isDefault`, in group order. **At most one default per group** is the rule; `defaultOptionIds` never returns two for a group even if the data were to disagree.
- `resolveLineOptions` is **unchanged**. It still knows nothing about defaults: it resolves exactly the ids it is handed.

### Migration

`0020_modifier_option_default.sql` (generated with `bun run db:generate`): `ALTER TABLE modifier_options ADD COLUMN is_default boolean NOT NULL DEFAULT false;` — additive, safe on a live shop, and the existing rows keep today's behaviour.

## API

### `POST /api/v1/cafe-menu` (command, new module `cafe-menu`)

- Guard `auth: { can: 'products.write' }` (the route can carry one permission only — `auth.plugin.ts` has no AND — so the other two are checked in the use case).
- Body: `{ itemKeys: string[] }` — 1 to 60 known SKUs; an unknown key answers `INVALID_CAFE_MENU_ITEM` with `params.key`. The body carries only keys: prices, names and groups come from the server's own constant, so a client cannot set a price.
- The use case takes `branchId` from `await branch()` and requires `products.write`, `categories.write` and `modifiers.write` through `requirePermission` **before writing anything** (`DomainForbiddenError` 403 otherwise).
- It runs inside one `IUnitOfWork.run()`, reads what exists once (categories, groups with options and product links, products), plans with `planCafeMenu`, then creates only what is missing through the existing ports (`ICategoryRepository`, `IProductRepository`, `IModifierRepository`) and links a new product to its groups with `setProductGroups`.
- **One audit entry** for the whole command (`cafe_menu.applied`, the item keys and the counts), written inside the same unit of work through `IAuditLog`, following `buildAuditEntry`.
- Answer:

```ts
{
  added:  { categories: number; products: number; groups: number; options: number }
  reused: { categories: number; groups: number }
  skipped: { products: number; items: { key: string; name: string }[] }
}
```

### Changed: modifier options

- `POST /modifier-groups/:id/options` and `PATCH /modifier-options/:id` accept `isDefault` (optional, default `false`).
- Setting `isDefault: true` on one option clears it on the group's other options: **one default per group**. The rule lives in the two option use cases (a group's options are more than one row), each wrapped in `IUnitOfWork.run()` since they can now write more than one row.
- The modifier group response gains `isDefault` on each option.
- Additive contract changes: `bun run openapi:check` changes, and the project owner is told before the baseline is recorded again.

## Web

- `features/products`: a "เพิ่มจากชุดเมนูคาเฟ่" button in the page header and the same action as the empty state, both only when the user has `products.write` **and** `categories.write` **and** `modifiers.write` (`can(...)`, as `AppSidebar.tsx` already does). `CafeMenuDialog.tsx`: a checkbox per category (indeterminate when partly chosen), a checkbox per item with its price, a count of what is ticked, and a live line "จะเพิ่ม N / ข้าม M" computed with the shared `planCafeMenu` from data already on screen. A mutation hook in `api.ts` invalidates through `productKeys`, the categories feature's key factory and the modifiers feature's key factory; the result is shown as a toast ("เพิ่ม 18 ข้าม 4", plus the names of the skipped items when there are any).
- `features/modifiers` (`ModifiersPage.tsx`): a "ค่าเริ่มต้น" checkbox per option, with one line saying its price is added automatically when it is chosen, and that only one option per group can be the default.
- `features/pos` (`OptionsDialog.tsx`): the starting `chosen` is `defaultOptionIds(groups)` instead of `[]`. The sticky footer already shows the unit price including it, and a preset default can be un-chosen like any other pick.
- New text in `features/products/locales.ts`, `features/modifiers/locales.ts` and `src/locales/errors.ts` (the new `INVALID_CAFE_MENU_ITEM`).
- The alias `@pos/api/cafe-menu` is added to all three places that must stay in sync: `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`.

## Rules

- **Never overwrite what exists.** A skipped product keeps its own price, category, image and groups. Links are set with `setProductGroups` **only for products created in this run**, because that call replaces the whole set — calling it on an existing product would silently drop the owner's own groups.
- **The server is the authority.** The dialog's preview is a display aid computed from what the page has loaded (products are read with `includeInactive: true, limit: 1000`); the toast reports what the server actually did. A shop with more than a thousand products can see a preview that misses a skip; the server's counts settle it.
- **Prices are a starting point**, said in the dialog in one line, with a link to the products page.
- **A concurrent second apply is safe but not silent:** both runs read before either writes, so the unique constraints (`categories.name`, `modifier_groups.name`, `modifier_options (group_id, name)`, `products.sku`) make the loser answer `DomainConflictError` 409 and create nothing (the whole unit of work rolls back). Retrying then skips.
- **Authorization is three permissions, in three layers**: the web hides the button, the route guards `products.write`, and the use case requires all three before the first write. A shop with the modifiers switch off still needs `modifiers.write`: a switch hides screens, it never blocks the API.
- **`resolveLineOptions` stays the only place the selection rules live.** The default is a preselection, so a required group can be satisfied by its default, and the recorded option is one the cashier saw and confirmed.

## Testing

- **Domain** (`cafe-menu.domain.test.ts`): `planCafeMenu` adds everything when nothing exists; skips a product with the same SKU; skips a product with the same name ignoring case and surrounding spaces; reuses an existing category by name and creates none; reuses an existing group; a mixed run. `modifier.domain.test.ts`: `defaultOptionIds` returns one id per group in group order, ignores inactive groups and options, returns none when nothing is flagged, never returns two for one group; `ModifierOptionEntity` accepts `isDefault`, defaults it to false and round-trips it through `toSnapshot`.
- **Use cases** (`apply-cafe-menu.usecase.test.ts` with the mock ports from `src/__tests__/mocks.ts`): the created shape for a small set (category, product, group, options, links); the skip path writes nothing and counts what it skipped; an unknown key is rejected before any write; a user without `categories.write` or `modifiers.write` is rejected before any write; the audit entry is recorded once; nothing is written when the unit of work is not used. Modifier option use cases: setting a default clears the previous one on the same group, and setting it false leaves the others alone.
- **Integration** (`cafe-menu.integration.test.ts`): `POST /api/v1/cafe-menu` with two keys answers counts and the products exist with the set's prices and their two groups; a second call answers `added.products: 0` and `skipped.products: 2`; a shop that already has a `เครื่องดื่ม` category gets no second one; an unknown key answers 400 with the code. The modifiers integration test covers the `isDefault` round-trip and the one-default rule over HTTP.
- **Web**: a unit test for the dialog's selection-to-plan wiring if it holds any rule of its own.
- `bun run openapi:check`: the diff must be additive only, and the owner is told before the new baseline is recorded.
- `bun run screenshots`: the products page empty state and the dialog at 390, 768 and 1366px.
- e2e keeps working (the e2e shops choose `restaurant` or `other`): the products page must not change behaviour for a shop that never opens the dialog.

## Left to the builder

- The dialog's layout, wording and icons, following `DESIGN.md`.
- Whether the preview reads products with `limit: 1000` or a narrower query.
- Whether `planCafeMenu` is one function or two, and how much of the shaping lives in the use case.
- Whether the four modifier-option types keep sharing one test file or get one each.
- The order of the commits.
