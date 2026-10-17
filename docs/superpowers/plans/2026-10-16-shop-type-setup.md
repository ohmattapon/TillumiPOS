# Shop Type at First-Run Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first-run setup asks what kind of shop this is and turns three web features (tables, kitchen, modifiers) and the home view on or off to match. The owner can change each switch later in `/settings`.

**Architecture:** Three boolean columns on `shop_settings` hold the switches. A pure domain function maps a shop type to switches plus a home view. `CompleteSetupUseCase` applies it. The web reads the switches from `useSettings()` and hides menus, routes and controls. Nothing is enforced on the server.

**Tech Stack:** Bun, Elysia, Drizzle (PostgreSQL), tsyringe, zod. React, TanStack Query, react-i18next, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-10-16-shop-type-setup-design.md`

## Global Constraints

- Work on branch `ohmattpon/shop-type-setup`. Commit with `gitcz --non-interactive` only (AGENTS.md), one concern per commit. End each `--body` with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Shop types, in this order: `cafe`, `restaurant`, `retail`, `other`.
- Defaults by type: cafe = tables off, kitchen off, modifiers on, `till`. restaurant = all on, `tables`. retail = all off, `till`. other = all on, `till`.
- `DEFAULT_SHOP_SETTINGS` and the migration default have all three switches `true`, so existing shops change nothing.
- `shopType` in setup is optional and defaults to `other` (an additive v1 change).
- `tablesEnabled: false` together with `homeView: 'tables'` is rejected with `INVALID_SHOP_SETTINGS`.
- The switches only hide things in the web. They are not checked by any use case or route guard.
- `ProductPicker` (the modifier picker on the sell screen) does not look at `modifiersEnabled`.
- When tables are off, `OrderTools` hides only "move to table". Merge and split stay.
- All user-facing text goes through `t()`, in Thai and English, in the owning feature's `locales.ts`. Touch targets are at least 44px. New screens must work at 390, 768 and 1366px.
- `bun run openapi:check` will change (additive). Show the diff to the project owner before recording the baseline.
- Done means `bun run typecheck` and `bun run test` pass. The dev DB is a cloud demo: never run DB-dropping scripts against it (see memory "No Docker unless needed"). Ask before starting Docker.

## Review Focus

1. **An existing shop after the upgrade:** the migration must default every switch to `true`, so no menu disappears. → Task 2 integration test.
2. **Turning tables off in a single PATCH while the home view is `tables`:** the API rejects it, so the web must send `homeView: 'till'` in the same request. → Task 2 use case test, Task 5 form logic test.
3. **An old client that sends setup without `shopType`:** gets `other` (all on, `till`). → Task 3 unit and integration tests.
4. **A bookmarked URL of a switched-off feature** (`/kitchen` on a kitchen tablet, `/tables`): it redirects to `/` and does not crash. → Task 6 visibility function test (route list excludes it).
5. **The loading moment:** before settings arrive, `useSettings()` returns the all-on defaults, so a retail shop briefly sees every menu. Accepted. Nothing must *break* in that moment, and no test is added for it.

---

### Task 1: Domain — shop types, switches and the home view rule

**Files:**
- Modify: `apps/api/src/domains/shop-settings.domain.ts`
- Test: `apps/api/src/domains/shop-settings.domain.test.ts`

**Interfaces:**
- Produces:
  - `export const SHOP_TYPES = ['cafe', 'restaurant', 'retail', 'other'] as const` and `export type ShopType`
  - `export type ShopFeatures = { tablesEnabled: boolean; kitchenEnabled: boolean; modifiersEnabled: boolean; homeView: HomeView }`
  - `export function shopFeaturesFor(type: ShopType): ShopFeatures`
  - `ShopSettingsProps` (and the entity's readonly fields and `toSnapshot()`) gain `tablesEnabled`, `kitchenEnabled`, `modifiersEnabled: boolean`. `DEFAULT_SHOP_SETTINGS` sets all three to `true`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('shopFeaturesFor', () => {
  test.each([
    ['cafe', { tablesEnabled: false, kitchenEnabled: false, modifiersEnabled: true, homeView: 'till' }],
    ['restaurant', { tablesEnabled: true, kitchenEnabled: true, modifiersEnabled: true, homeView: 'tables' }],
    ['retail', { tablesEnabled: false, kitchenEnabled: false, modifiersEnabled: false, homeView: 'till' }],
    ['other', { tablesEnabled: true, kitchenEnabled: true, modifiersEnabled: true, homeView: 'till' }],
  ] as const)('%s', (type, expected) => expect(shopFeaturesFor(type)).toEqual(expected))

  test('every type gives settings the entity accepts', () => {
    for (const type of SHOP_TYPES) expect(() => new ShopSettingsEntity({ ...DEFAULT_SHOP_SETTINGS, ...shopFeaturesFor(type) })).not.toThrow()
  })
})

test('the defaults turn every feature on', () => {
  expect(DEFAULT_SHOP_SETTINGS).toMatchObject({ tablesEnabled: true, kitchenEnabled: true, modifiersEnabled: true })
})

test('the floor plan cannot be home while tables are off', () => {
  expect(() => new ShopSettingsEntity({ ...DEFAULT_SHOP_SETTINGS, tablesEnabled: false, homeView: 'tables' }))
    .toThrow(expect.objectContaining({ code: 'INVALID_SHOP_SETTINGS' }))
})

test('a switch survives with() and toSnapshot()', () => {
  expect(new ShopSettingsEntity(DEFAULT_SHOP_SETTINGS).with({ kitchenEnabled: false }).toSnapshot().kitchenEnabled).toBe(false)
})
```

Match the existing test file's style for asserting domain errors if it differs from `objectContaining`.

- [ ] **Step 2: Run them and see them fail**

Run: `cd apps/api && bun test src/domains/shop-settings.domain.test.ts`
Expected: FAIL (`shopFeaturesFor` is not exported).

- [ ] **Step 3: Implement**

Add the constants, type and function next to `HOME_VIEWS`. Validate in the constructor that the three switches are booleans, and add the rule `if (!props.tablesEnabled && props.homeView === 'tables') throw invalid('ปิดการใช้โต๊ะอยู่ จึงตั้งผังโต๊ะเป็นหน้าแรกไม่ได้')`. Add the three fields to the class, the constructor assignments and `toSnapshot()`.

- [ ] **Step 4: Run them and see them pass**

Run: `cd apps/api && bun test src/domains/shop-settings.domain.test.ts`
Expected: PASS. Run `bun run typecheck` at the root: errors are expected only where `ShopSettingsProps` objects are built (repository, mocks, factories). Fix the test helpers in `src/__tests__/` (mocks/factories) now, and leave the repository to Task 2.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/shop-settings.domain.ts apps/api/src/domains/shop-settings.domain.test.ts apps/api/src/__tests__/
gitcz --non-interactive --type=feat --scope=settings --subject="map each shop type to the features it uses" --body="..."
```

---

### Task 2: Store and edit the switches through settings

**Files:**
- Modify: `apps/api/src/infrastructure/database/schema/shop-settings.ts` (three `boolean().notNull().default(true)` columns: `tablesEnabled`, `kitchenEnabled`, `modifiersEnabled`)
- Create: `apps/api/drizzle/0018_*.sql` with `bun run db:generate` in `apps/api` (rename it to `0018_shop_features.sql` and update `meta/_journal.json` if the repo names migrations by hand; follow how `0017_permissions` was named)
- Modify: `apps/api/src/modules/settings/adapters/repository/shop-settings.drizzle.repository.ts` (`columns`)
- Modify: `apps/api/src/modules/settings/applications/schemas/settings-schemas.ts` (three `z.boolean()` in the partial object)
- Modify: `apps/api/src/modules/settings/adapters/controllers/schemas/settings.schema.ts` (three `t.Boolean()` in `fields`)
- Test: `apps/api/src/modules/settings/applications/usecases/settings.usecases.test.ts`, `apps/api/src/__tests__/integration/settings.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 props.
- Produces: `GET`/`PATCH /api/v1/settings` carry `tablesEnabled`, `kitchenEnabled`, `modifiersEnabled`. The web type `ShopSettings` from `@pos/api/types` gains them automatically.

- [ ] **Step 1: Write the failing tests**

Use case (mock ports):
- `'turns a feature off'`: `execute({ kitchenEnabled: false }, actor)` saves `kitchenEnabled: false` and records an audit entry whose `after` contains `kitchenEnabled: false`.
- `'refuses to turn tables off while the floor plan is home'`: current settings `homeView: 'tables'`, `execute({ tablesEnabled: false }, actor)` rejects with code `INVALID_SHOP_SETTINGS` and saves nothing.
- `'turns tables off and the till home together'`: `execute({ tablesEnabled: false, homeView: 'till' }, actor)` succeeds.

Integration:
- `'a shop starts with every feature on'`: after `resetDatabase()`, `GET /settings` has all three `true`.
- `'the owner switches features off and they stay off'`: `PATCH { tablesEnabled: false, modifiersEnabled: false }`, then `GET` returns them `false` and `kitchenEnabled: true`.

- [ ] **Step 2: Run them and see them fail**

Run: `cd apps/api && bun test src/modules/settings` (unit), then the integration file (needs the test DB from `.env.test`).
Expected: FAIL (unknown keys stripped by zod / missing in the response).

- [ ] **Step 3: Implement** the files listed above. Generate the migration and check that its SQL is only three `ALTER TABLE "shop_settings" ADD COLUMN ... boolean DEFAULT true NOT NULL`.

- [ ] **Step 4: Run them and see them pass**, then `cd apps/api && bun run openapi:check`. Expected: it reports the three new fields on the settings schemas. Do not record the baseline yet (Task 3 adds to it too).

- [ ] **Step 5: Commit**

```bash
gitcz --non-interactive --type=feat --scope=settings --subject="store the tables, kitchen and modifier switches" --body="..."
```

---

### Task 3: Setup applies the shop type

**Files:**
- Modify: `apps/api/src/modules/setup/applications/schemas/setup-schemas.ts` (`shopType: z.enum(SHOP_TYPES).default('other')`)
- Modify: `apps/api/src/modules/setup/adapters/controllers/schemas/setup.schema.ts`: `shopType: t.Optional(t.Union([...SHOP_TYPES literals]))`
- Modify: `apps/api/src/modules/setup/applications/usecases/complete-setup.usecase.ts`: `.with({ shopName: dto.shopName, ...shopFeaturesFor(dto.shopType) })`
- Test: `apps/api/src/modules/setup/applications/usecases/setup.usecases.test.ts`, `apps/api/src/__tests__/integration/setup.integration.test.ts`
- Record: `apps/api/test/openapi-baseline.json`

**Interfaces:**
- Consumes: `SHOP_TYPES`, `shopFeaturesFor` (Task 1).
- Produces: `POST /api/v1/setup` accepts an optional `shopType`.

- [ ] **Step 1: Write the failing tests**

Unit:
- `'a retail shop starts with tables, kitchen and modifiers off'`: `execute({ ...input, shopType: 'retail' })`, then the saved settings match `{ shopName: input.shopName, tablesEnabled: false, kitchenEnabled: false, modifiersEnabled: false, homeView: 'till' }`.
- `'a restaurant opens on the floor plan'`: `shopType: 'restaurant'` saves `homeView: 'tables'`.
- `'without a shop type everything stays on'`: `input` as is saves all three `true` and `homeView: 'till'`.
- `'an unknown shop type is refused'`: `shopType: 'bar'` rejects with `ZodError`, and nothing is saved.

Integration:
- `'setup with a shop type sets the features'`: `POST /setup` with `body({ shopType: 'cafe' })`, then `GET /settings` (signed in as the new owner) shows `tablesEnabled: false, kitchenEnabled: false, modifiersEnabled: true`.

- [ ] **Step 2: Run them and see them fail**

Run: `cd apps/api && bun test src/modules/setup`
Expected: FAIL.

- [ ] **Step 3: Implement** the three changes listed above.

- [ ] **Step 4: Run them and see them pass.** Then `bun run openapi:check`: the diff must be only the three settings fields and the optional `shopType`. **Show the diff to the project owner**, and after they agree, record the baseline with the repo's record command (see `test/openapi-snapshot.ts`).

- [ ] **Step 5: Commit**

```bash
gitcz --non-interactive --type=feat --scope=setup --subject="apply the shop type chosen at first-run setup" --body="..."
```

---

### Task 4: Setup page asks for the shop type

**Files:**
- Modify: `apps/web/src/features/setup/components/SetupPage.tsx`
- Create: `apps/web/src/features/setup/components/ShopTypeChoice.tsx`
- Modify: `apps/web/src/features/setup/locales.ts`
- Modify: `apps/web/e2e/run.ts` (the setup flow)

**Interfaces:**
- Consumes: `SHOP_TYPES`, `ShopType` from `@pos/api/shop-settings`. The setup mutation input gains `shopType`.
- Produces: `ShopTypeChoice({ value: ShopType | null, onChange(type: ShopType): void })`.

- [ ] **Step 1: Update the e2e setup flow first** (it is the test of this page): before pressing "ตั้งค่าและเข้าสู่ระบบ", pick the type with `page.getByRole('radio', { name: /อื่นๆ/ }).check()` (or the accessible name you give it). Then add a check `'the setup button stays disabled until a shop type is chosen'`.

- [ ] **Step 2: Implement `ShopTypeChoice`** as a `role="radiogroup"` with a labelled legend ("ร้านของคุณเป็นแบบไหน" / "What kind of shop is this?") and four radio cards, each at least 44px high (`min-h-11`), with a lucide icon (`Coffee`, `UtensilsCrossed`, `ShoppingBasket`, `Store`) and one line saying what it turns on. Put a note under it saying everything can be turned on later in Settings. Lay it out in 2 columns from `sm:` and 1 column below that.

  Locale keys in `setup`: `shopType.legend`, `shopType.note`, and `shopType.<type>.name` / `shopType.<type>.hint` for each of the 4 types, in `th` and `en`.

- [ ] **Step 3: Wire it into `SetupPage`.** Place it right after the shop name. Keep `shopType: ShopType | null` in state (start at `null`, so nothing is selected), make `canSubmit` require it, and send it with the mutation. It is outside the `Object.values(form)` string check, so keep it as a separate `useState`.

- [ ] **Step 4: Verify**

Run: `bun run typecheck && bun run lint`, then `bun run e2e` (it uses its own throwaway DB: follow memory "e2e on Neon" if Docker is not running). Expected: the setup checks pass. Run `bun run screenshots` and look at the setup page at 390, 768 and 1366px.

- [ ] **Step 5: Commit**

```bash
gitcz --non-interactive --type=feat --scope=web --subject="ask the shop type on the first-run setup page" --body="..."
```

---

### Task 5: Settings page — the features section

**Files:**
- Create: `apps/web/src/features/settings/lib/feature-switches.ts` with `feature-switches.test.ts`
- Modify: `apps/web/src/features/settings/components/SettingsPage.tsx`
- Modify: `apps/web/src/features/settings/locales.ts`

**Interfaces:**
- Produces: `withTablesSwitch<T extends { tablesEnabled: boolean; homeView: HomeView }>(form: T, tablesEnabled: boolean): T`. Turning tables off also sets `homeView: 'till'`. Turning them on leaves `homeView` as it is.

- [ ] **Step 1: Write the failing test**

```ts
test('turning tables off moves home to the till', () => {
  expect(withTablesSwitch({ tablesEnabled: true, homeView: 'tables' }, false)).toEqual({ tablesEnabled: false, homeView: 'till' })
})
test('turning tables on keeps the chosen home', () => {
  expect(withTablesSwitch({ tablesEnabled: false, homeView: 'till' }, true)).toEqual({ tablesEnabled: true, homeView: 'till' })
})
```

- [ ] **Step 2: Run it and see it fail**: `cd apps/web && bun test src/features/settings/lib/feature-switches.test.ts`

- [ ] **Step 3: Implement** the function. Then add a `Section` titled "ฟีเจอร์" / "Features" to `SettingsForm`, with three rows. Each row has a `Switch` (from `@/components/ui/switch`, `aria-label`, row at least 44px high), a label and a one-line hint. Add the three fields to the form state and to `changes`. The tables switch goes through `withTablesSwitch`. While tables are off, the home view `Select` disables the `tables` option. Locale keys: `features.title`, `features.tables`, `features.tablesHint`, `features.kitchen`, `features.kitchenHint`, `features.modifiers`, `features.modifiersHint`, `features.homeNeedsTables`.

- [ ] **Step 4: Verify**: the unit test passes, then `bun run typecheck && bun run lint`.

- [ ] **Step 5: Commit**

```bash
gitcz --non-interactive --type=feat --scope=web --subject="let the owner switch tables, kitchen and modifiers in settings" --body="..."
```

---

### Task 6: Hide what is switched off

**Files:**
- Create: `apps/web/src/features/settings/hooks/use-features.ts` (exported from `features/settings/index.ts`)
- Modify: `apps/web/src/app/App.tsx`, `apps/web/src/app/AppSidebar.tsx`, `apps/web/src/app/BottomNav.tsx`
- Modify: `apps/web/src/features/pos/components/PosPage.tsx`, `OrderTools.tsx`, `CartPanel.tsx`
- Modify: `apps/web/src/features/categories/components/CategoriesPage.tsx`
- Modify: `apps/web/src/features/products/components/ProductFormDialog.tsx`

**Interfaces:**
- Produces: `useFeatures(): { tables: boolean; kitchen: boolean; modifiers: boolean }`, read from `useSettings()`.

Most checks are a single `&&`, and the sidebar list is already inline in `AppSidebar.tsx`, so no separate pure function is needed. (Review Focus 4, bookmarked URLs, is covered by not rendering the `Route`: the existing `*` route redirects to `/`.)

- [ ] **Step 1: Gate each place, as in the spec's table:**
  - `tables`: the `tables` route and sidebar item, `FloorPage` as index (`homeView === 'tables' && tables`), the floor link in `BottomNav`, the "choose table" button and menu item and `FloorDialog` in `PosPage`, and only the move-to-table block in `OrderTools`.
  - `kitchen`: the `kitchen` and `kitchen-stations` routes and sidebar items, `KitchenSendButton`, the note field and "sent" badge in `CartPanel`, and the station field and the station queries in `CategoriesPage` (`enabled: canRoute && kitchen`).
  - `modifiers`: the `modifiers` route and sidebar item, and the modifier fieldset in `ProductFormDialog`. Keep `modifierGroupIds: undefined` when the fieldset is hidden, so attached groups are kept.
  - Do **not** touch `ProductPicker`.

- [ ] **Step 2: Verify**

Run: `bun run typecheck && bun run lint && bun run test` (needs the test DB), then `bun run e2e`. Expected: all pass. e2e shops are seeded with defaults (all on), so their flows are unchanged. Run `bun run screenshots` and look at the sell page, the sidebar and settings at every size.

- [ ] **Step 3: Manual check in the dev app** (`bun run dev`): turn each switch off in `/settings` and confirm that its menus disappear, that typing `/kitchen` lands on `/`, and that turning it back on brings everything back.

- [ ] **Step 4: Commit**

```bash
gitcz --non-interactive --type=feat --scope=web --subject="hide tables, kitchen and modifiers when the shop switches them off" --body="..."
```

---

### Task 7: Finish

- [ ] Record the shop type feature in `docs/superpowers/roadmap.md` the way recent features were recorded (see commit `c0e85ef`). Commit as `docs`.
- [ ] Run `bun run typecheck` and `bun run test` once more. Push `ohmattpon/shop-type-setup` and report the branch and the latest commit.
