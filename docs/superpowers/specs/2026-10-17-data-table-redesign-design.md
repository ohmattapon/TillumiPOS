# Data table redesign

Date: 2026-10-17
Branch: `ohmattpon/data-table-redesign`

## Why

The project owner likes the shadcn/ui "Data Table" and a Dribbble shot, "Data Table for Project Managers/CEO/Leads" (a toolbar with search above a roomy, borderless table inside a white rounded card), and wants every table in the system to look and work that way.

Today every table goes through one shared `DataTable` (`src/components/DataTable.tsx`, 13 call sites). It is built on the plain shadcn `Table` primitive and hand-rolled: columns with a `priority`, a list instead of a table on phones, skeleton rows while loading, and a clickable row. It has no toolbar. Each page builds its own search box and filter bar above the `Panel`.

The shadcn Data Table recipe is TanStack Table (`@tanstack/react-table`) wrapped in shadcn components. It is not installed yet.

## Goals

- Every table in the web looks like the reference: a roomy table in a white rounded card, a toolbar above it with the search, no heavy dividers.
- The shared `DataTable` is built on TanStack Table, as the shadcn recipe does, so later features (sorting, column visibility) can be added on top instead of hand-rolled.
- A toolbar slot above the table holds the search box. A page puts in only what it needs.
- All 13 call sites move to the new component in this project, so there is one table in the system, not two.

## Non-goals

- **No column sorting.** Almost every list is server-paged and the API has no sort parameters, so sorting in the browser would reorder only the page in view and look like a full sort. The owner chose to leave sorting out of this project (the other choices were adding sort parameters to the API, or sorting the visible page only). It can come later, with the API work it needs.
- **No row selection and no bulk actions.** No checkbox column, no select-all, no Delete / Export / Import buttons. (The owner said no checkboxes. Bills cannot be deleted and most records are disabled, never deleted, so a bulk Delete would have fought the domain rules anyway.)
- **No API change.** `openapi:check` and `server/test/openapi-baseline.json` stay untouched.
- **No column visibility menu, no column resizing, no drag-to-reorder, no saved table layouts.** Not asked for.
- **No copying of the reference's colors, fonts or avatar style.** The look comes from `DESIGN.md` tokens. The reference gives the structure and spacing, not the palette.
- Phones keep the list layout. Nothing is built that scrolls a wide table sideways on a phone.

## Anti-goals (a failure even if it works)

- A page loses behavior it has today: a clickable row that opens something, keyboard access to it (Tab, Enter), the muted look of a disabled row, per-row action menus, the skeleton while loading, the empty state, the error state.
- A table overflows horizontally at 390, 768 or 1366px (e2e checks this), or a control in it is under 44px tall.
- A table looks sortable but sorts only some of the data.
- Money or quantity columns lose `tabular-nums` and right alignment.
- A page's search or filters stop working, or start sending different requests than today.

## What the owner decided

- Use the shadcn Data Table approach for all tables.
- The visual reference is the Dribbble shot above, taken "overall" (the whole look).
- No checkbox column.
- No column sorting in this project.

## What I decided (the owner has not seen these, so check them)

1. **The look follows the reference's structure, not its palette.** Card with `rounded-[10px]`, a toolbar row on top, row height of about 52px on tablet and desktop, no vertical hairlines between columns, a faint horizontal divider between rows or none (the builder picks whichever reads better against `border`). Header text stays small and muted. Colors come from existing tokens only.
2. **`DESIGN.md` is updated in the same change.** It currently asks for "compact tables" with hairline column dividers and 11px headers. That is the opposite of the reference, so the sections "Overview", "Elevation & Depth" (row dividers), "Components" (`tableHead`, `tableCell`) and the table line in "Screen sizes and app structure" are rewritten to match. Two sources of truth would be a worse result than either look.
3. **The `Column<T>` shape stays.** Call sites keep writing `{ id, header, priority, align, className, cell }`. The new `DataTable` turns these into TanStack column definitions inside. This keeps the 13 migrations small and keeps `splitColumns` for the phone list.
4. **Search is the page's job, the toolbar is only where it sits.** Pages that already search (products through a debounced `q` sent to the server, members through `?search=`) keep their logic and move the input into the toolbar. `DataTable` does not own a search box and does not filter rows itself, because a table-owned filter would break on the server-paged ones.
5. **The toolbar is a slot, not a fixed set of buttons.** `DataTable` takes a `toolbar` node. A small shared `TableSearch` input (icon + 44px field, `aria-label`) is provided because three or more pages need it.
6. **Toolbar placement.** Filter tabs and counts (`SegmentedTabs`) stay above the card where they are today. Inside the card, between the `Panel` header and the table, the toolbar holds the search input. The page's main action ("Add product") stays in `Panel`'s `action` slot. Nothing about how a page's filters work changes.
7. **`Panel` keeps its header.** The card, title and description stay.
8. **The row action menu stays a `DropdownMenu` ("...").** The reference shows a pencil icon, but our menus carry several actions (edit, disable, void), so one icon would hide them.
9. **`ReportDataTable` and the audit page's dynamic tables** get the new look only. `ReportDataTable` is handed ready-made cells, so the builder keeps its adapter working with the new `DataTable`.
10. **One existing assertion changes, on purpose.** `DataTable.test.tsx` checks the old compact spacing (`px-3`). Step 3 changes that single spacing assertion to the new look, because the look is the thing the owner asked to change. Every other assertion stays as it is, and the commit message says which one changed and why.

## The pieces

| Piece | Where | What it does |
|---|---|---|
| `DataTable` | `src/components/DataTable.tsx` | Same props as today plus `toolbar?`. Renders the table from `@tanstack/react-table` on 640px and up and the phone list below. Both are still rendered with CSS choosing, as now. |
| `lib/data-table.ts` | `src/lib/` | `Column<T>`, `splitColumns`, and a pure function that turns `Column<T>[]` into TanStack column definitions. Tested with `bun test` beside it. |
| `TableSearch` | `src/components/TableSearch.tsx` | The shared search input for the toolbar. |

## Phone behavior

Below 640px the list from today stays: `primary` columns are the title, `secondary` the second line, `wide-only` hidden. The toolbar still shows, wrapped onto its own line, with the search input full width.

## Testing

- `lib/data-table.ts`: the column conversion, every rule.
- `DataTable.test.tsx` (exists): keep every existing assertion except the one spacing assertion named in decision 10, and add toolbar rendering. No other assertion is edited to make a change pass.
- `bun run e2e`: the "no horizontal overflow at 390, 768 and 1366" check must pass for every page that has a table.
- `bun run screenshots`, then look at phone, tablet and desktop for each migrated page before it is called done.
- `bun run typecheck`, `bun run lint` and `bun run test` pass at every commit.

## Rollout

One branch, one commit per concern, in this order so every commit leaves the app working:

1. Add `@tanstack/react-table` and the pure column conversion with tests.
2. Rebuild `DataTable` on it, keeping today's look and behavior, with `DataTable.test.tsx` green and unchanged at this step. Call sites need no edit.
3. Apply the new look (and the `DESIGN.md` update, and the one test assertion in decision 10).
4. Add the toolbar slot and `TableSearch`, then move each page's search into it, one commit per page group.

Steps 2 and 3 are separate so a regression in behavior can be told apart from a change of look.

## Left to the builder

- The exact row height, divider choice and spacing inside the ranges above.
- The text of the search placeholder and label in each feature's `locales.ts` or `src/locales/common.ts`, in Thai and English.
- Whether `TableSearch` debounces (it must not, if the page filters in the browser; pages that send the search to the server keep the debounce they have now).
- The `DataTable` type changes needed to let `ReportDataTable` and `AuditPage` (which build their columns dynamically) keep working, and whether the sticky header is needed for `ReportDataTable`'s scroll container.
