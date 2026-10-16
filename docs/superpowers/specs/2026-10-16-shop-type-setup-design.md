# Shop type at first-run setup

Date: 2026-10-16
Branch: `ohmattpon/shop-type-setup`

## Why

A new shop sees every part of the system on day one: tables, the kitchen board, kitchen stations and modifier groups. A minimart never uses tables or a kitchen, and a café rarely uses either. Those menus clutter the screen and lead staff into pages that have nothing to do with the shop.

The first-run setup asks one extra question, "What kind of shop is this?", and uses the answer to turn on only the features that kind of shop uses. It hides things. It never locks them: the owner can turn every feature back on in `/settings` at any time, and turning one off never deletes data.

## Goals

- The setup page asks for the shop type: café, restaurant, retail / minimart, or other.
- The answer sets three on/off switches (tables, kitchen, modifiers) and the home view.
- The owner can change each switch later in `/settings`.
- A switch that is off hides that feature's menus, routes and controls in the web.

## Non-goals

- **No starter data.** Choosing a type does not create categories, products, modifier groups or tables. (The owner chose hiding menus over seeding data.)
- **No server-side blocking.** The switches decide what the web shows. They are not permissions, and the API keeps accepting every request it accepts today. Who may do what is still decided by roles (`auth: { can }`).
- **No stored shop type.** Only the switches are stored. The type is an input to setup, not a setting (YAGNI: nothing reads it after setup).
- No switches for members, promotions, shifts, reports or the customer display. Those stay on for every shop.

## Anti-goals (failure even if it works)

- Data disappears, or a sale fails, because a feature was switched off.
- An existing shop loses a menu after the upgrade. Shops that are already set up must keep everything on.
- A shop gets stuck: the owner cannot find how to turn a feature back on.

## Shop types and defaults

| Type (`shopType`) | Tables | Kitchen | Modifiers | Home view |
|---|---|---|---|---|
| `cafe` | off | off | on | `till` |
| `restaurant` | on | on | on | `tables` |
| `retail` | off | off | off | `till` |
| `other` | on | on | on | `till` (what setup does today) |

The defaults are my call (the owner approved the table without changes). The restaurant home view of `tables` is also my call: the system already has `homeView`, so the restaurant type uses it.

## What each switch hides in the web

| Switch | Hidden when off |
|---|---|
| `tablesEnabled` | Sidebar `/tables`, the `/tables` route, the floor plan (`FloorPage`, `FloorDialog`, the "choose table" button and menu item on `PosPage`, the floor link in `BottomNav`), and the move-to-table picker in `OrderTools` (merge and split stay, because they also work on orders without a table — my call). The table name on an order that already has one may still show in `CartPanel`. |
| `kitchenEnabled` | Sidebar `/kitchen` and `/kitchen-stations`, both routes, `KitchenSendButton`, the kitchen note field and "sent" badge on cart lines in `CartPanel`, and the kitchen station field on `CategoriesPage`. |
| `modifiersEnabled` | Sidebar `/modifiers`, the `/modifiers` route, and the modifier section of `ProductFormDialog`. |

A route that is off redirects to `/` like any unknown path (the existing `*` route).

**The modifier picker on the sell screen (`ProductPicker`) does not depend on the switch.** If a product has modifier groups attached, the picker still asks for them, because `resolveLineOptions` on the server still requires a required group. Hiding the picker would make those sales fail. With the switch off, the owner simply has no screen to attach groups. A retail shop starts with no groups, so it never sees the picker. (My call.)

## Rules

- **Turning tables off forces the home view to `till`.** The entity rejects `tablesEnabled: false` together with `homeView: 'tables'` (`INVALID_SHOP_SETTINGS`). The settings page sets the home view to `till` when the owner turns tables off, and disables the "tables" choice for the home view while tables are off. (My call.)
- Turning a switch off is allowed while open orders sit at tables or kitchen tickets are waiting. Nothing is closed or deleted. Those orders remain reachable through "open orders" on the sell page. (My call: blocking would need a cross-module port, and the switch is only about display.)
- The mapping from type to switches is one pure function in the domain, `shopFeaturesFor(type)` in `domains/shop-settings.domain.ts`, next to `SHOP_TYPES`. It is a rule in one place.

## API

### Shop settings

- `ShopSettingsProps` gains `tablesEnabled`, `kitchenEnabled`, `modifiersEnabled` (booleans). `DEFAULT_SHOP_SETTINGS` has all three `true`.
- Migration `0018_shop_features`: three `boolean NOT NULL DEFAULT true` columns on `shop_settings`. The default of `true` keeps every existing shop exactly as it is.
- `updateShopSettingsSchema` gains the three optional booleans. `UpdateShopSettingsUseCase` already audits every changed field, so no new audit code is needed.
- The settings response (`GET` and `PATCH /api/v1/settings`) gains the three fields. The v2 `capabilities` does not carry settings and is unchanged. This is an additive contract change: `bun run openapi:check` changes, and the project owner is told before the baseline is recorded again.

### Setup

- `completeSetupSchema` gains `shopType: z.enum(SHOP_TYPES).default('other')`. It is optional so the v1 contract stays additive: an existing client that does not send it gets today's behaviour.
- `CompleteSetupUseCase` saves `shopFeaturesFor(dto.shopType)` together with the shop name, in the same `with({ ... })` call inside the existing unit of work.

## Web

### Setup page

- A new required question, "What kind of shop is this?", sits right after the shop name. It shows four large choices (radio cards at least 44px high): café, restaurant, retail / minimart, other. Each has an icon and one line saying what it turns on. Nothing is preselected, so the owner has to choose.
- A note under the choices says that every feature can be turned on later in Settings.
- The page must still fit at 390, 768 and 1366px.

### Settings page

- A new "Features" section with three switches (tables, kitchen, modifiers), each with one line of explanation.
- The home view choice follows the rule above.

### Reading the switches

- The web reads the switches from `useSettings()`, where `homeView` is already read. `App.tsx` (routes), `AppSidebar.tsx`, `BottomNav.tsx` and the components listed above check them.
- All new text goes in `features/setup/locales.ts` and `features/settings/locales.ts` (Thai and English).

## Testing

- Domain: `shopFeaturesFor` for every type, and the entity rule for tables off with home view `tables` (in `shop-settings.domain.test.ts`).
- Use cases: `CompleteSetupUseCase` saves the switches for a given type, and uses `other` when no type is sent. `UpdateShopSettingsUseCase` saves the switches and rejects the invalid combination.
- Integration: `POST /api/v1/setup` with `shopType: 'retail'` results in settings with all three switches off. `PATCH /api/v1/settings` round-trips the switches.
- Web: if the "what is visible" logic grows beyond simple checks, put it in a pure function with a test next to it (for example, which nav items to show for a set of switches and permissions).
- e2e: if e2e drives the setup page, it must choose a type. Make sure the e2e shops keep the features their tests use (choose `restaurant` or `other`).
- `bun run screenshots`: check the setup page and the settings page at all sizes.

## Left to the builder

- The icons, exact wording and layout of the type choices (following `DESIGN.md`).
- Whether a feature check in a component is written inline or through a small hook such as `useFeatures()`.
- The order of the commits.
