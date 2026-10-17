---
version: alpha
name: TillumiPOS
description: A point-of-sale system in mint-teal on white. Deep teal accent, roomy, readable data, usable with mouse, keyboard and touch screen.
colors:
  background: "#ffffff"
  canvas: "#f7fbfa"
  foreground: "#1c1917"
  primary: "#0f766e"
  on-primary: "#ffffff"
  accent: "#d9f2eb"
  on-accent: "#0f766e"
  muted: "#f6f5f3"
  muted-foreground: "#79716b"
  border: "#e7e5e4"
  sidebar: "#ffffff"
  sidebar-accent: "#d9f2eb"
  success: "#168b49"
  warning: "#c26f00"
  destructive: "#e7000b"
typography:
  page-title:
    fontFamily: Inter Variable, IBM Plex Sans Thai
    fontSize: 16px
    fontWeight: 600
  section-title:
    fontFamily: Inter Variable, IBM Plex Sans Thai
    fontSize: 14px
    fontWeight: 600
  body:
    fontFamily: Inter Variable, IBM Plex Sans Thai
    fontSize: 14px
    fontWeight: 400
  caption:
    fontFamily: Inter Variable, IBM Plex Sans Thai
    fontSize: 12px
    fontWeight: 400
  table-header:
    fontFamily: Inter Variable, IBM Plex Sans Thai
    fontSize: 11px
    fontWeight: 500
    letterSpacing: 0.05em
  stat-value:
    fontFamily: Inter Variable
    fontSize: 24px
    fontWeight: 600
  grand-total:
    fontFamily: Inter Variable
    fontSize: 30px
    fontWeight: 600
  payment-amount:
    fontFamily: Inter Variable
    fontSize: 36px
    fontWeight: 600
rounded:
  sm: 6px
  md: 8px
  lg: 10px
  xl: 14px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.background}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
  status-pill:
    rounded: "{rounded.full}"
    height: 22px
  touch-target:
    minHeight: 44px
---

# TillumiPOS Design System

This document describes the look and the design rules of the web app (`src/` at the repo root). All the actual values live in `src/index.css`. If this document disagrees with that file, treat the file as the source of truth and fix this document.

## Overview

TillumiPOS is a work tool, not a landing page. Staff use the sales screen hundreds of times a day, so the design rests on three principles:

1. **Fast before pretty.** The most frequent tasks (scan, add a product, take payment) must finish without scrolling and without taking a hand off the scanner or the touch screen.
2. **Calm.** White cards on a pale mint canvas, thin lines, a single accent color (teal). Other colors appear only when they carry meaning (status, category, or telling the figures in a summary card apart).
3. **Hard to get wrong.** Actions that cannot be undone must ask for confirmation and say what will happen. A button that cannot be pressed must look like it cannot be pressed.

The approach comes from the restraint of Attio mixed with Linear: a white sidebar, the selected menu item on a soft mint background with teal text, a white page header with a navigation breadcrumb, and roomy tables in a white card, with rows tall enough to read at a glance and to tap.

## Colors

All colors are shadcn/ui CSS variables. Use them through Tailwind classes such as `bg-primary` and `text-muted-foreground`. Never write a color value directly in a component.

| Role | Value | Used for |
|---|---|---|
| `background` | `#ffffff` | Cards, dialogs, the page header and input fields |
| `canvas` | `#f7fbfa` | The background of the content area behind the cards (`bg-canvas` on `SidebarInset`) |
| `foreground` | `#1c1917` | Main text |
| `primary` | `#0f766e` | The one primary button per screen, the selected option, the date in the page header, and the open menu item |
| `accent` | `#d9f2eb` | The background of the selected sidebar item and of a product card on hover |
| `muted` | `#f6f5f3` | The background of summary cells, filter bars and products that have no image yet |
| `muted-foreground` | `#79716b` | Secondary text, descriptions, table headers |
| `border` | `#e7e5e4` | Every kind of border and divider |
| `sidebar` | `#ffffff` | The sidebar background (the cart panel uses the same white card background) |
| `chart-1` … `chart-3` | `#12b8a6` / `#5b8def` / `#a78bfa` | Charts: mint is the main color, blue and violet are secondary |
| `success` | `#168b49` | Success, ready to sell, change due |
| `warning` | `#c26f00` | Running low, needs attention |
| `destructive` | `#e7000b` | Voiding a bill, out of stock, errors |
| `category-1` … `category-8` | See `index.css` | The color of a category. Orange and red tones are left out so they never get mixed up with `primary` and `destructive` |

Rules for using color:

- The teal accent goes on one primary button per screen. Every other button is `outline` or `ghost`.
- The sidebar is white. The selected item has an `accent` background and `accent-foreground` text, flat, with no shadow or border.
- Every main page has a faint breadcrumb above the page title, through the `breadcrumb` prop of `PageHeader`.
- Status colors (green, amber, red) are always paired with text or an icon. Never convey meaning with color alone.
- The background of a status badge is the status color at 10% opacity (`bg-success/10`) and the text is the full status color.
- A category's color comes from `categoryColor(id)` (exported from `@/features/categories`), which picks one of eight tones by id order. It is not stored in the database. It is used as the stripe on a product card, as the dot in front of a category tab (`dot` of `SegmentedTabs`), and as `CategoryDot` in front of a category name in a list. Never use it as a full card background or to convey status.
- The icon in a summary card with a figure uses its own color as a 12% background and a full-color icon, so each figure can be told apart at a glance.
- There are five themes: `light`, `dark`, `midnight`, `forest` and `rose`. They are chosen from the user menu and remembered in the browser under `pos.theme`. The color values live under `data-theme` in `index.css`; rely on semantic tokens first. The `dark` and `midnight` themes use the `dark` class together with the shadcn components and toasts. QR codes keep a white background so they stay readable.

## Typography

- **Inter Variable** is used for Latin letters and digits. **IBM Plex Sans Thai** is used for Thai letters. Both are installed in the project through `@fontsource`, so they work without an internet connection.
- There are three weights: 400 for body text, 500 for labels and buttons, 600 for headings and key figures. Do not use bold 700, except on the receipt.
- Every money figure and every quantity needs the `tabular-nums` class so the digits line up in a column.
- Money is always shown with two decimal places, through `formatBaht` in `src/lib/money.ts`, and is prefixed with `฿` when it appears outside a table.
- Table headers are 11px with letter spacing, in `muted-foreground`, and uppercase when the text is Latin.
- The receipt uses `font-mono` so the columns line up on a thermal printer.

| Level | Size | Weight | Used for |
|---|---|---|---|
| Payment amount in a dialog | 36px | 600 | The amount due, the change |
| Grand total in the cart | 30px | 600 | The grand total |
| Figure in a summary card | 24px | 600 | Sales, number of bills |
| Page header | 16px | 600 | The page title |
| Login page heading | 20px | 600 | The title of the login page |
| Body text, card header | 14px | 400 / 600 | General text |
| Description | 12px | 400 | Secondary lines, notes |
| Table header | 11px | 500 | Column headers, menu group labels |

## Layout

- App frame: a 256px sidebar on the left that collapses to a 48px icon rail, then a 64px page header, then a content area that scrolls on its own. The page as a whole never scrolls.
- The sales page has two parts: the product list, which stretches to fill the space, and a 320px cart panel on the right (384px when the screen is 1280px wide or more). The grand total and the pay button are always at the bottom of the panel and never scroll out of sight.
- Product cards lay out automatically with a minimum width of 152px and a 4:3 image on top.
- Product cards use `rounded-md` corners, no shadow, and a 2px category color stripe, so the list looks flat and is easy to read.
- The "Today" page uses a summary strip instead of separate figure cards: two columns on a small screen and four on a wide one. The bill list is the main area. The panels on this page use `rounded-md` corners and no shadow, without changing the panels of other pages.
- First load uses a skeleton. When loading fails, show the error and a retry button. Never show a "no items" message together with an error. If there is earlier data, keep it and say that the update failed.
- Spacing uses one scale: 4, 8, 12, 16, 24px. The margin of the content area is 16px and the gap between cards is 12 or 16px.

### Screen sizes and app structure

Design and test at three sizes. These values match the Tailwind breakpoints `sm` (640px) and `lg` (1024px):

| Range | Width | Example devices |
|---|---|---|
| Phone | below 640px | A phone in portrait (390px) |
| Tablet | 640–1023px | A tablet in portrait (768px) |
| Large | 1024px and up | A tablet in landscape, a computer (1366px) |

- Main menu: on a large screen the sidebar is expanded with names. On a tablet it is a 48px icon rail by default. On a phone the sidebar is hidden and a bottom bar with 4 slots (Sell, Today, Shift, Menu) is used. The remaining items open from the "Menu" button.
- Cart: on a large screen it is a fixed right panel. Below 1024px it is a bottom bar showing the count, the total and the pay button. Tapping it opens the whole cart as a sheet from the bottom.
- Buttons in the header bar: every button is 44px tall. Below 640px they are gathered into a "More actions" button. A long title can wrap, and never breaks in the middle of a word.
- Tables: always use `DataTable`. A `primary` column is the title of a row on a phone, `secondary` is the secondary line, and `wide-only` is shown from 1024px up. A table can carry a toolbar inside its card (the `toolbar` prop, usually a `TableSearch`); the toolbar is drawn once, above both the table and the phone list.
- Dialogs: at most `100svh - 2rem` tall and scrollable inside. A dialog without a form uses `DialogFooter sticky` so the buttons stay at the bottom. A dialog with a form puts its buttons at the end of the form, and you scroll down to reach them.
- Table floor plan: below 640px it is a list where you can edit the name and seats and turn a table on or off. Positions cannot be dragged.
- No page scrolls horizontally at 390, 768 and 1366px (checked by e2e).
- Login page (`LoginPage`): a single floating card centered on the `muted` background. From 1024px up the card holds two halves in about a 1:1 ratio, a till picture on the left and the form on the right with a `primary` caption bar reusing the brand headline. Below that width the picture is hidden and the card shows the form only. The card stays flat at elevation level 1, a border with no shadow.
- Touch target: every visible button and input field is at least 44px tall, with no exceptions (checked on the sales page by e2e).

## Elevation & Depth

Depth comes mainly from borders. Shadows are used sparingly and are soft:

| Level | Look | Used for |
|---|---|---|
| 0 | No shadow, with a divider | Table rows, list items |
| 1 | A border, no shadow | Cards, data panels (`Panel`), product cards |
| 2 | The shadcn shadow + a translucent dark backdrop | Dialogs and dropdown menus |

## Shapes

- Buttons and input fields: 8px rounded corners.
- Cards and data panels: 10px rounded corners, no shadow.
- Status badges, counters and profile pictures: fully round (`rounded-full`).
- Icons come from a single set, `lucide-react`, at 16px in buttons and menus. Do not mix in other icon sets and do not use emoji in place of icons.

## Components

Always use components from `src/components/ui` (shadcn/ui) first, and use the shared components below when the pattern matches. Do not create a duplicate pattern.

| Component | File | Use when |
|---|---|---|
| `PageHeader` | `components/PageHeader.tsx` | The header of every page: a faint breadcrumb on top (the `breadcrumb` prop), the page title, a one-line description and the primary button on the right |
| `Panel` | `components/Panel.tsx` | A card with a header, a description and a table or list inside. 10px corners, a border, no shadow |
| `tableHead`, `tableCell` | `components/Panel.tsx` | The classes for a table header and a cell, used on every data table: roomy spacing (`px-4`, `py-4`) and no vertical dividers between columns |
| `StatusBadge` | `components/StatusBadge.tsx` | A status badge with a colored dot in front. Four tones: `success`, `warning`, `danger`, `neutral` |
| `SegmentedTabs` | `components/SegmentedTabs.tsx` | A filter that picks one of a few options. Use `size="touch"` on the sales page |
| `DatePicker` | `components/DatePicker.tsx` | Choosing a day with the shadcn Calendar + Popover. The button and the days are at least 44px tall. It takes the language and the Buddhist/Gregorian year from `useFormat()`. The value in a form is still `YYYY-MM-DD` and is converted through `lib/calendar-date.ts` without shifting the day because of the timezone |
| `ProductImage` | `features/products/components/ProductImage.tsx` | Every product image. Shows an icon instead when there is no image or it cannot load |
| `Receipt` | `features/sales/components/Receipt.tsx` | The body of the receipt, both on screen and when printing |
| `SkeletonRows`, `SkeletonPanel`, `SkeletonCardGrid`, `SkeletonStatCards` | `components/Skeletons.tsx` | Placeholders while loading, shaped like the list, the product cards and the summary cards |

Size of tappable elements:

| Context | Height |
|---|---|
| Buttons on management pages and in the page header | 36px |
| A table row on a management page (`DataTable`) | About 52px for a row of text, about 60px when it holds an action button, with hover |
| Buttons in a dialog | 40px |
| Everything on the sales page and in the payment dialog | At least 44px |
| The pay button | 56px |

Interaction patterns:

- **The result of an action** is announced with a toast (`sonner`) at the top center of the screen. The message says what happened, for example "Voided bill 20261013-00012 and returned the stock".
- **Form errors** appear in the form under the field they belong to, with `role="alert"`, and do not close the dialog.
- **Actions that cannot be undone** (voiding a bill) must ask for a reason, say what will happen, and use a `destructive` button.
- **Entering data** uses a dialog. Never use `window.prompt`, `window.confirm` or `window.alert`.
- **Empty state:** every table and list must show a message when there is no data.
- **Loading** uses a skeleton (`Skeleton`) shaped like the real content. Do not use a bare "Loading" text and do not use a spinner. Use the components from `components/Skeletons.tsx`, or the built-in skeleton of `DataTable` while there is no data yet. Never show a zero ("0 items", "All stock is sufficient", "No bills yet") or an empty-state message while loading, because people will read it as a real answer. Every skeleton is a `role="status"` with a hidden "Loading" text, and the shimmer stops when the user asks for reduced motion.
- **Shortcuts on the sales page:** F2 goes to the search field and F9 takes payment. The key is shown on the button.
- **Focus:** after adding a product or closing a receipt, focus returns to the search field only when the device has a mouse, so the keyboard on a touch screen does not pop up.
- **Printing** prints only the receipt, 72mm wide for an 80mm printer. Anything that should not print gets the `print:hidden` class.

## Customer display

The `/customer` page is a second screen facing the customer at the counter. It works only on the same machine and browser as the sales page (the data travels over a `BroadcastChannel` named `easypos-customer-display`). It only displays: it has no buttons or input fields.

| State | Shows |
|---|---|
| Idle | The shop name and a welcome message |
| Selling | The items, the subtotal, the discount, the tax and the grand total in the largest type |
| Paying | The amount due and a PromptPay QR with its expiry time |
| Paid | A green check mark, a thank-you message and the change, shown for 5 seconds and then back to idle |

Rules:

- The message that is sent contains only what is on the receipt. Never add cost, profit, stock levels, the cashier's name or internal ids to `DisplayState`. The message validator drops unknown fields.
- This page does not call the API and does not need a login (it sits before the login gate of `App`), so it can never be a way into the shop's data.
- Font sizes follow the screen height (the `--u` variable) so the text can be read from 1–2 meters. At 1080p: item rows ~36px, grand total ~96px.
- Green is used for "Paid" only and always comes with a check mark and text. There is no orange button because there are no buttons.
- The sales page repeats its state every 10 seconds. A screen that has been silent for more than 30 seconds goes back to idle, so the previous customer's cart does not linger.

## Do's and Don'ts

Do:

- Use short Thai text in the words shops actually use, such as "รับเข้า" (receive), "ปรับยอด" (adjust) and "ยกเลิกบิล" (void bill).
- Give an `aria-label` to every button that has only an icon, and tie a `Label` to every input field.
- Disable a button that cannot be pressed and give the reason near it, for example "Only 2 left" under a quantity that exceeds the stock.
- Test screens at 390, 768 and 1366px with `bun run screenshots` and look at the images before calling the work done.

Don't:

- Use the teal color on more than one button in a single screen.
- Use gradients, heavy shadows or animation for decoration.
- Hide the grand total or the pay button under something you have to scroll past.
- Show an amount without decimals, or compute money as a decimal in the web app (money is an integer number of satang up to the point of display).
- Create a new component that duplicates the job of one in the table above.

## Known gaps

This list is where the current system does not yet meet the standard of this document:

| Topic | Detail |
|---|---|
| Contrast of the primary button | White text on `#0f766e` gives 5.47:1 on a white background (5.25:1 on the canvas background), which passes WCAG AA. Checked with `scripts/check-contrast.mjs` |
| Contrast of status badges | 12px text in `success` (about 4.4:1) and `warning` (about 3.8:1) on white is below 4.5:1, and lower still on a pale background |
| Long forms on a phone | The confirm button of a dialog that has a form is not always pinned to the bottom; you have to scroll down to it (see the screen sizes section) |
| Multiple languages | Thai text is embedded in the components and has not yet been split into language files (item 4 in the roadmap) |
| Dark mode | The `dark` and `midnight` themes exist. Check screens and dialogs when adding or changing a component |
| Receipt | It does not yet have the shop name, address and tax id (item 11 in the roadmap) |

The contrast ratios above were calculated from the color values by hand and have not been verified with a tool.
