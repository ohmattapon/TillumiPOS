# Data table redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the shared `DataTable` on TanStack Table with the roomy Dribbble-style look and a search toolbar slot, and move all 13 call sites onto it.

**Architecture:** `src/lib/data-table.ts` keeps the `Column<T>` shape and gains a pure `toColumnDefs` that turns those columns into TanStack column definitions. `DataTable` renders from `useReactTable` (core row model only) and keeps the CSS-chosen table-or-list rendering. A `toolbar` slot and a shared `TableSearch` input sit inside the card above the table. Call sites do not change except the two that already have a search box.

**Tech Stack:** React 19, `@tanstack/react-table` v8, Tailwind + shadcn `Table`, `bun test` with `renderToStaticMarkup`, react-i18next.

**Spec:** `docs/superpowers/specs/2026-10-17-data-table-redesign-design.md`

## Global Constraints

- No column sorting, no checkbox column, no bulk actions, no Delete / Export / Import. Do not enable any TanStack feature beyond `getCoreRowModel` (no sorting, filtering, pagination or selection models).
- No API change: nothing under `server/` is touched, and `server/test/openapi-baseline.json` is not recorded again.
- Colors come from existing tokens only (`bg-card`, `border`, `text-muted-foreground`, ...). No color value written in a component.
- Every control in a table or toolbar is at least 44px tall (`h-11`). Phones keep the list layout; `primary` / `secondary` / `wide-only` priorities keep their meaning. `wide-only` is shown from 1024px up.
- Every text a user reads comes from `t()`; `TableSearch` takes its label and placeholder as props and holds no text of its own.
- `Column<T>` call-site shape `{ id, header, priority, align?, className?, cell }` does not change.
- Commit with `gitcz` only, one concern per commit, never `build` as the type (use `chore`), stage files by name. Every commit leaves `bun run typecheck`, `bun run lint` and `bun run test:web` green.
- No existing test assertion is edited except the one spacing assertion in `src/components/DataTable.test.tsx` (`px-3`), changed in Task 3 only.
- Do not start Docker, WSL or a database, and never run a script that drops or truncates data. `bun run test` (which includes the API tests that truncate tables) and `bun run e2e` are not run by the agent; see Task 6.

## Review Focus

Failure modes the spec implies that no obvious test would catch; each is pinned by a test in the task named.

1. The toolbar renders exactly once. `DataTable` renders both the table and the phone list and lets CSS choose; a toolbar placed inside either branch would appear twice, duplicating the search input and its label (Task 4).
2. A `rowKey` of `0` still renders its row. `ReportDataTable` uses row indexes starting at 0 as keys, and TanStack row ids are strings (Task 2).
3. Rows stay real `<tr>` elements that carry the row's accessible name, and the actions cell stays in the row. The e2e checks find rows with `getByRole('row', { name })` (Task 2).
4. The toolbar stays on screen while the table is loading and when it is empty, so typing in the search box is never interrupted or the box lost (Task 4).
5. On `MembersPage`, a failed request must not remove the search box, or a bad search term would leave the user stuck. The page keeps its search visible above the error (Task 5, checked by hand because this branch has no DOM test environment).

---

### Task 1: Column definitions for TanStack

**Files:**
- Modify: `package.json`, `bun.lock` (via `bun add`)
- Modify: `src/lib/data-table.ts`
- Test: `src/lib/data-table.test.ts`

**Interfaces:**
- Consumes: the existing `Column<T>` and `splitColumns`.
- Produces: `toColumnDefs<T>(columns: Column<T>[]): ColumnDef<T>[]`. Each definition has `id` equal to the column's `id`, `header` equal to the column's `header`, `cell` that calls `column.cell(row.original)`, and `meta` of type `{ column: Column<T> }` so the renderer can read `align`, `priority` and `className` back. The module augments `ColumnMeta` once so `meta.column` is typed.

- [ ] **Step 1: Install the dependency**

Run `bun add @tanstack/react-table`. Expected: it appears under `dependencies` in `package.json` as a `^8` range, and `bun.lock` changes.

- [ ] **Step 2: Write the failing tests** in `src/lib/data-table.test.ts`, in a new `describe('toColumnDefs', ...)` beside the existing one:
  - `keeps each column's id and header, in order`: two columns give definitions whose `id` are `['name', 'price']` and `header` are `['Name', 'Price']`.
  - `renders a cell by calling the column's cell with the row`: build a fake cell context `{ row: { original: { name: 'Coffee' } } } as unknown as CellContext<Row, unknown>`, call `defs[0].cell`, expect `'Coffee'`.
  - `hands the original column back through meta`: `defs[1].meta?.column` is the same object as the second input column (`toBe`).

- [ ] **Step 3: Run `bun test src/lib/data-table.test.ts`.** Expected: FAIL, `toColumnDefs` is not exported.

- [ ] **Step 4: Implement `toColumnDefs` in `src/lib/data-table.ts`** with the `declare module '@tanstack/react-table'` augmentation of `ColumnMeta<TData extends RowData, TValue>` adding `column: Column<TData>`.

- [ ] **Step 5: Run `bun test src/lib/data-table.test.ts` and `bun run typecheck`.** Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/lib/data-table.ts src/lib/data-table.test.ts
gitcz --non-interactive --type=feat --scope=web --subject="turn table columns into TanStack column definitions" --body="First step of moving DataTable onto TanStack Table; call sites keep the Column shape."
```

### Task 2: Rebuild `DataTable` on TanStack with today's look

**Files:**
- Modify: `src/components/DataTable.tsx`
- Test: `src/components/DataTable.test.tsx`

**Interfaces:**
- Consumes: `toColumnDefs`, `splitColumns`, `Column<T>` from `@/lib/data-table`.
- Produces: `DataTable<T>` with exactly today's props (`columns`, `rows`, `rowKey`, `empty`, `isPending?`, `actions?`, `onSelect?`, `rowLabel?`, `muted?`). Rows are built from `useReactTable({ data: rows, columns: toColumnDefs(columns), getCoreRowModel: getCoreRowModel(), getRowId: (row) => String(rowKey(row)) })`.

This task changes how the table is built, not how it looks or behaves, so the tests are written first and must pass against the old implementation, then against the new one.

- [ ] **Step 1: Write characterization tests** in `src/components/DataTable.test.tsx`, in a new `describe('DataTable behavior', ...)` (use the file's existing i18n setup and `renderToStaticMarkup`). Each must pass on the current code:
  - `renders a row whose key is 0` (Review Focus 2): rows `[{ id: 0, name: 'Zero' }]`, `rowKey={(row) => row.id}`, markup contains `Zero`.
  - `each row is a real tr with its cells and the actions cell` (Review Focus 3): two rows with `actions={(row) => <button>{`act-${row.name}`}</button>}`; the markup has a `<tr` for the header plus one per row (count of `<tr` is 3), and both `act-` buttons appear.
  - `wide-only columns are hidden below 1024px in the header and in every cell`: one `wide-only` column; its header and cell markup contain `hidden lg:table-cell`.
  - `the phone list leaves wide-only columns out and keeps primary and secondary`: a `primary`, a `secondary` and a `wide-only` column; the text of the `wide-only` cell appears once (table only), the other two appear twice (table and list).
  - `an empty table spans every column including the actions column`: `rows={[]}`, `actions` given, two columns; markup contains `colSpan="3"` and the `empty` text.
  - `a selectable row is reachable from the keyboard`: with `onSelect`, markup contains `tabindex="0"`; without it, does not.
  - `a muted row is dimmed`: `muted={() => true}` gives `text-muted-foreground` on the row.

- [ ] **Step 2: Run `bun test src/components/DataTable.test.tsx`.** Expected: PASS on the current implementation (these pin today's behavior).

- [ ] **Step 3: Rebuild `DataTable`** with `useReactTable`, rendering the header from `table.getHeaderGroups()[0].headers` and the body from `table.getRowModel().rows` with `flexRender`. Read `align`, `priority` and `className` from `header.column.columnDef.meta.column`. The phone list iterates the same rows (`row.original`). Keep every class, `aria-*`, the skeleton rows, the `empty` row and `splitColumns` exactly as they are now. Do not enable any other row model.

- [ ] **Step 4: Run `bun test src/components/DataTable.test.tsx src/lib` and `bun run typecheck`.** Expected: all PASS, including the untouched `px-3` assertion.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataTable.tsx src/components/DataTable.test.tsx
gitcz --non-interactive --type=refactor --scope=web --subject="build DataTable on TanStack Table" --body="No change of look or behavior; characterization tests were written first and passed before and after."
```

### Task 3: The roomy look and the `DESIGN.md` update

**Files:**
- Modify: `src/components/Panel.tsx` (`tableHead`, `tableCell`), `src/components/DataTable.tsx` (row and cell classes), `DESIGN.md`
- Modify: `src/components/DataTable.test.tsx` (the spacing assertion only)

**Interfaces:**
- Produces: `tableHead` and `tableCell` with the new spacing, used by `DataTable` only (they have no other users). New values: header `h-11 px-4`, cell `px-4 py-4` (about a 52px row with one line of text), no `border-r` on header cells, row dividers `border-border/60`, last row without a divider, `hover:bg-muted/50` kept.

- [ ] **Step 1: Change the spacing assertion first.** In the existing `DataTable (compact admin rows)` test, rename the describe and test to describe roomy rows, and replace `expect(html).toContain('px-3')` with `expect(html).toContain('px-4')` and `expect(html).toContain('py-4')`; keep the `hover:bg-muted/50` line. Add `header cells have no vertical divider`: markup does not contain `border-r`.

- [ ] **Step 2: Run `bun test src/components/DataTable.test.tsx`.** Expected: FAIL on `px-4`/`py-4` and on `border-r`.

- [ ] **Step 3: Apply the new classes** in `Panel.tsx` and `DataTable.tsx`. Money and quantity cells keep `tabular-nums` and right alignment. Update the comment above `tableHead` (it still says "hairline column dividers"). Keep 11px muted uppercase headers; it is the reference's structure, not its type scale, that is adopted.

- [ ] **Step 4: Update `DESIGN.md`** so it matches: the Overview line that says "compact tables ... read densely" now says roomy, readable tables; the table row in the "Size of tappable elements" section says about 52px instead of about 40px; the "Tables" line under Screen sizes mentions that a table can carry a toolbar with the page's search above it; the `tableHead`, `tableCell` row in the Components table describes roomy spacing without column dividers.

- [ ] **Step 5: Run `bun test src/components/DataTable.test.tsx`, `bun run typecheck`, `bun run lint`.** Expected: PASS.

- [ ] **Step 6: Commit** in two commits so the look and the document can be told apart:

```bash
git add src/components/Panel.tsx src/components/DataTable.tsx src/components/DataTable.test.tsx
gitcz --non-interactive --type=feat --scope=web --subject="give data tables roomy rows without column dividers" --body="The one changed assertion is the old compact spacing check (px-3), replaced by px-4 and py-4 because the owner asked for the new look."
git add DESIGN.md
gitcz --non-interactive --type=docs --scope=web --subject="describe roomy data tables in the design system" --body="The compact-table rules conflicted with the new look."
```

### Task 4: Toolbar slot and `TableSearch`

**Files:**
- Create: `src/components/TableSearch.tsx`, `src/components/TableSearch.test.tsx`
- Modify: `src/components/DataTable.tsx`, `src/components/Panel.tsx` (export `tableToolbar` class string beside `tableHead`)
- Test: `src/components/DataTable.test.tsx`

**Interfaces:**
- Produces: `DataTable` gains `toolbar?: ReactNode`, rendered once, above both the table and the phone list, inside a `div` with `tableToolbar` (`flex flex-wrap items-center gap-3 border-b px-4 py-3`). `TableSearch({ value, onChange, label, placeholder, className })` where `value: string`, `onChange: (value: string) => void`, `label: string` (becomes the `aria-label`), `placeholder?: string`, `className?: string`; a 44px-tall input with a leading `Search` icon from `lucide-react`.

- [ ] **Step 1: Write the failing tests.**
  - In `DataTable.test.tsx`: `renders the toolbar exactly once` (Review Focus 1): `toolbar={<span>find-me</span>}`; the markup contains `find-me` exactly once (count occurrences). `keeps the toolbar while loading` and `keeps the toolbar when there are no rows` (Review Focus 4): same check with `isPending` and with `rows={[]}`. `renders no toolbar wrapper when none is given`: markup does not contain `border-b px-4 py-3`.
  - In `TableSearch.test.tsx`: `labels the input for assistive technology and shows the placeholder`: markup contains `aria-label="ค้นหา"` and `placeholder="ชื่อ"` for those props; `the field is 44px tall`: contains `h-11`.

- [ ] **Step 2: Run `bun test src/components`.** Expected: FAIL (no `toolbar` prop, no `TableSearch`).

- [ ] **Step 3: Implement** `tableToolbar` in `Panel.tsx`, the `toolbar` prop in `DataTable.tsx` (rendered before the two branches, outside both), and `TableSearch.tsx`. `TableSearch` does no debouncing and filters nothing; the page owns the value.

- [ ] **Step 4: Run `bun test src/components`, `bun run typecheck`, `bun run lint`.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/TableSearch.tsx src/components/TableSearch.test.tsx src/components/DataTable.tsx src/components/Panel.tsx src/components/DataTable.test.tsx
gitcz --non-interactive --type=feat --scope=web --subject="add a toolbar slot and a shared search input to DataTable"
```

### Task 5: Products and Members use the toolbar

**Files:**
- Modify: `src/features/products/components/ProductsPage.tsx`, `src/features/members/components/MembersPage.tsx`

**Interfaces:**
- Consumes: `TableSearch`, `tableToolbar`, `DataTable`'s `toolbar` prop.

The page logic does not change: Products keeps its debounced `q` (`useDebouncedValue`, the `searching` flag, the labels `t('search.label')` and `t('search.placeholder')`); Members keeps `?search=` in the URL and its `filter('search', value)` handler. Only where the input is drawn changes.

- [ ] **Step 1: ProductsPage.** Remove the search input and the now unused `Search` / `Input` imports from the filter row above the `Panel` (the `SegmentedTabs` stay there). Pass `toolbar={<TableSearch value={search} onChange={setSearch} label={t('search.label')} placeholder={t('search.placeholder')} />}` to the `DataTable`. The input stays a controlled field bound to the same state.

- [ ] **Step 2: MembersPage.** Remove the search `Input` from the filter row above the `Panel`; the status `Select` stays there. Pass the same kind of `TableSearch` (label and placeholder `t('search')`, `onChange` calling `filter('search', value)`) as the `DataTable`'s `toolbar`. When `members.error` is set, `DataTable` is not rendered (as today), so render the same `TableSearch` inside a `div` with `tableToolbar` above the error message, so the search stays reachable (Review Focus 5).

- [ ] **Step 3: Run `bun run typecheck`, `bun run lint`, `bun run test:web`.** Expected: PASS, and no unused import warnings.

- [ ] **Step 4: Check by hand.** Without Docker or a database, do not claim these work. If the owner provides the throwaway e2e database, run `bun run dev`, open `/products` and `/members`, and confirm: typing in the search keeps focus while rows reload; the search is in the card above the table at 390, 768 and 1366px; on `/members`, with the API stopped, the error shows and the search box is still there. Otherwise report these as unchecked.

- [ ] **Step 5: Commit** (two commits, one per page):

```bash
git add src/features/products/components/ProductsPage.tsx
gitcz --non-interactive --type=refactor --scope=products --subject="move the product search into the table toolbar"
git add src/features/members/components/MembersPage.tsx
gitcz --non-interactive --type=refactor --scope=members --subject="move the member search into the table toolbar" --body="The search stays visible above the error so a failed search term can be changed."
```

### Task 6: Whole-branch verification

**Files:** none.

- [ ] **Step 1: Run `bun run typecheck`, `bun run lint`, `bun run test:web`.** Expected: all pass. These are what the agent can run safely.

- [ ] **Step 2: Confirm the API is untouched.** `git diff origin/main --stat -- server` prints nothing.

- [ ] **Step 3: Confirm the unused-code check.** `Grep` for `border-r` and `px-3` inside `src/components/Panel.tsx` and `DataTable.tsx` (old divider and spacing classes should be gone) and for any other user of `tableHead` / `tableCell` (there should be none).

- [ ] **Step 4: Report what was not run.** `bun run test` (needs and truncates a database), `bun run e2e` and `bun run screenshots` are not run by the agent. Tell the owner these still need to be run, on the throwaway database, before merging: the e2e "no page scrolls sideways at 390, 768 and 1366" check and the e2e flows that find table rows by role are the ones most likely to notice a regression, and `bun run screenshots` is the check that the new look reads well on phone, tablet and desktop for every table page.

- [ ] **Step 5: Do not push.** Report the branch name and the latest commit, and ask the owner whether to run `git push -u origin ohmattpon/data-table-redesign`.
