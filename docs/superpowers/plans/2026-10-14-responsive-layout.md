# หน้าจอที่ใช้ได้ทุกขนาดจอ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หน้าขายและหน้าจัดการใช้ได้ครบบนมือถือ (390px) แท็บเล็ตแนวตั้ง (768px) และจอใหญ่ พร้อมกฎและคอมโพเนนต์กลางที่หน้าใหม่ทำตาม

**Architecture:** แก้ฝั่งเว็บล้วน: ช่วงจอสามช่วง (`sm` 640, `lg` 1024), เมนูหลักแบบ sidebar/แถบไอคอน/เมนูล่าง, ตะกร้าเป็นแถบล่าง+แผงจากล่างเมื่อจอ < 1024, `DataTable` กลางที่เป็นตารางหรือรายการด้วย CSS, dialog ที่เลื่อนได้และปุ่มติดล่าง, e2e ที่ตรวจการล้นจอและเป้ากด

**Tech Stack:** React 19, Tailwind 4, shadcn/ui (sidebar, sheet, dialog), react-router, playwright-core (e2e)

**Spec:** `docs/superpowers/specs/2026-10-14-responsive-layout-design.md`

## Global Constraints

- ทำใน worktree `D:\easypos-shots` บน branch `ohmattpon/responsive-layout` ห้ามแตะ `D:\POS` ห้าม push ห้าม merge commit ด้วย `gitcz` เท่านั้น (`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`) stage เฉพาะไฟล์ของเรื่องนั้น และห้าม commit `apps/web/e2e/shots.ts` จนกว่าจะถึง Task 7
- ไม่เปลี่ยน API: `bun run openapi:check` ต้องผ่านโดยไม่บันทึก baseline
- ไม่เปลี่ยนสี ฟอนต์ รูปทรงการ์ด คีย์ลัด F2/F9
- ข้อความที่ผู้ใช้อ่านทุกตัวผ่าน `t()` ในไฟล์ `locales.ts` ของ feature (หรือ `src/locales/common.ts`) และ `en` ใช้ `satisfies typeof th`
- feature เรียก feature อื่นผ่าน `@/features/<name>` เท่านั้น คอมโพเนนต์ที่ไม่ผูกธุรกิจอยู่ `src/components`
- สลับรูปแบบตามจอด้วย class ของ Tailwind (`sm:`, `lg:`) ไม่วัดจอด้วย JavaScript ยกเว้นค่าเริ่มต้นของ sidebar ที่อ่านครั้งเดียวตอนเริ่ม
- เป้ากดที่มองเห็นทุกตัวสูงอย่างน้อย 44px (`h-11` / `size-11`)
- e2e เดิม 26 ข้อต้องผ่านโดยไม่เปลี่ยนความหมายของการตรวจ ปรับได้แค่ locator ที่ย้ายที่
- ก่อนบอกว่าเสร็จ: `bun run typecheck`, `bun run test`, `bun run lint`, `vite build`, `bun run e2e` ผ่าน

## Review Focus

- แป้นพิมพ์บนมือถือเปิดใน dialog ที่ยาว (ฟอร์มสินค้า, ชำระเงิน): ปุ่มยืนยันต้องยังกดได้ (Task 5)
- ตะกร้าเปิดเป็นแผงแล้วกดชำระ: แผงต้องปิดและ dialog ชำระเงินต้องไม่ซ้อนใต้แผง (Task 4)
- หมุนแท็บเล็ตจากแนวตั้งเป็นแนวนอนขณะแผงตะกร้าเปิดอยู่: ต้องไม่มีตะกร้าสองชุดพร้อมกัน (Task 4)
- ตารางที่ว่างหรือกำลังโหลดบนมือถือ: ต้องแสดงข้อความว่างเหมือนบนจอใหญ่ (Task 1)
- ชื่อสินค้าหรือชื่อร้านยาวมากบนจอ 390px: ต้องตัดบรรทัด ไม่ดันหน้าให้ล้นแนวนอน (Task 3, 7)
- ผังโต๊ะบนมือถือ: แก้รายละเอียดโต๊ะได้โดยไม่ต้องลาก (Task 6)

---

### Task 1: `DataTable` และหน้าหมวดหมู่

**Files:**
- Create: `apps/web/src/components/DataTable.tsx`, `apps/web/src/lib/data-table.ts`, `apps/web/src/lib/data-table.test.ts`
- Modify: `apps/web/src/features/categories/components/CategoriesPage.tsx`

**Interfaces:**
- Produces:
  ```ts
  type ColumnPriority = 'primary' | 'secondary' | 'wide-only'
  interface Column<T> { id: string; header: string; cell: (row: T) => ReactNode; priority: ColumnPriority; align?: 'right'; className?: string }
  function splitColumns<T>(columns: Column<T>[]): { primary: Column<T>[]; secondary: Column<T>[] }  // lib/data-table.ts
  function DataTable<T>(props: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string | number; empty: ReactNode;
    actions?: (row: T) => ReactNode; onSelect?: (row: T) => void; rowLabel?: (row: T) => string; muted?: (row: T) => boolean; isPending?: boolean })
  ```
  `actions` คืนปุ่มเมนูของแถว (DropdownMenu) ซึ่งแสดงทั้งในตารางและรายการ `rowLabel` เป็นชื่อที่เข้าถึงได้ของแถวในรายการ

- [ ] **Step 1: ทดสอบฟังก์ชันล้วนให้ล้ม**

`apps/web/src/lib/data-table.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { splitColumns, type Column } from './data-table'

const column = (id: string, priority: Column<unknown>['priority']): Column<unknown> => ({ id, header: id, cell: () => id, priority })

describe('splitColumns', () => {
  test('primary columns head the list item, secondary ones go on the second line, wide-only ones are left out', () => {
    const split = splitColumns([column('name', 'primary'), column('barcode', 'wide-only'), column('price', 'secondary'), column('status', 'secondary')])

    expect(split.primary.map((item) => item.id)).toEqual(['name'])
    expect(split.secondary.map((item) => item.id)).toEqual(['price', 'status'])
  })

  test('without a primary column the first column leads, so a list item is never nameless', () => {
    const split = splitColumns([column('a', 'secondary'), column('b', 'secondary')])

    expect(split.primary.map((item) => item.id)).toEqual(['a'])
    expect(split.secondary.map((item) => item.id)).toEqual(['b'])
  })
})
```

Run: `cd apps/web && bun test src/lib/data-table.test.ts`
Expected: FAIL — `Cannot find module './data-table'`

- [ ] **Step 2: เขียนฟังก์ชันล้วน**

`apps/web/src/lib/data-table.ts`:

```ts
import type { ReactNode } from 'react'

/** primary: heads the list item on a phone. secondary: its second line. wide-only: only in the table. */
export type ColumnPriority = 'primary' | 'secondary' | 'wide-only'

export interface Column<T> {
  id: string
  header: string
  cell: (row: T) => ReactNode
  priority: ColumnPriority
  align?: 'right'
  className?: string
}

/** Which columns a phone shows, and where. */
export function splitColumns<T>(columns: Column<T>[]) {
  const shown = columns.filter((column) => column.priority !== 'wide-only')
  const primary = shown.filter((column) => column.priority === 'primary')
  if (primary.length > 0) return { primary, secondary: shown.filter((column) => column.priority === 'secondary') }
  return { primary: shown.slice(0, 1), secondary: shown.slice(1) }
}
```

Run: `cd apps/web && bun test src/lib/data-table.test.ts`
Expected: PASS 2/2

- [ ] **Step 3: เขียนคอมโพเนนต์**

`apps/web/src/components/DataTable.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { splitColumns, type Column } from '@/lib/data-table'
import { cn } from '@/lib/utils'

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  /** Shown when there are no rows and nothing is loading. */
  empty: ReactNode
  isPending?: boolean
  /** The row's own menu (usually a DropdownMenu); shown in the table and in the list. */
  actions?: (row: T) => ReactNode
  onSelect?: (row: T) => void
  /** Accessible name of a list item on a phone. */
  rowLabel?: (row: T) => string
  muted?: (row: T) => boolean
}

const head = 'h-10 px-4 text-[11px] font-medium tracking-wider text-muted-foreground uppercase'
const cellClass = 'px-4 py-3'

/**
 * A table on screens from 640px, a list on phones. Both are rendered and CSS shows one, so nothing
 * measures the screen and nothing flickers while the page loads.
 */
export function DataTable<T>({ columns, rows, rowKey, empty, isPending, actions, onSelect, rowLabel, muted }: Props<T>) {
  const { primary, secondary } = splitColumns(columns)
  const isEmpty = !isPending && rows.length === 0

  return (
    <>
      <Table className="hidden sm:table">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead key={column.id} className={cn(head, column.align === 'right' && 'text-right')}>
                {column.header}
              </TableHead>
            ))}
            {actions && <TableHead className={cn(head, 'w-0')} />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={rowKey(row)}
              className={cn(muted?.(row) && 'text-muted-foreground', onSelect && 'cursor-pointer')}
              onClick={onSelect && (() => onSelect(row))}
            >
              {columns.map((column) => (
                <TableCell key={column.id} className={cn(cellClass, column.align === 'right' && 'text-right tabular-nums', column.className)}>
                  {column.cell(row)}
                </TableCell>
              ))}
              {actions && <TableCell className={cn(cellClass, 'text-right whitespace-nowrap')}>{actions(row)}</TableCell>}
            </TableRow>
          ))}
          {isEmpty && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length + (actions ? 1 : 0)} className="h-24 text-center text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <ul className="divide-y sm:hidden">
        {rows.map((row) => {
          const body = (
            <>
              <span className="block truncate font-medium">
                {primary.map((column) => (
                  <span key={column.id} className="mr-2">{column.cell(row)}</span>
                ))}
              </span>
              {secondary.length > 0 && (
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {secondary.map((column) => (
                    <span key={column.id} className={cn(column.align === 'right' && 'tabular-nums')}>{column.cell(row)}</span>
                  ))}
                </span>
              )}
            </>
          )
          return (
            <li key={rowKey(row)} className={cn('flex min-h-14 items-center gap-2 px-4 py-2', muted?.(row) && 'text-muted-foreground')}>
              {onSelect ? (
                <button type="button" className="min-w-0 flex-1 text-left" aria-label={rowLabel?.(row)} onClick={() => onSelect(row)}>
                  {body}
                </button>
              ) : (
                <div className="min-w-0 flex-1" aria-label={rowLabel?.(row)}>{body}</div>
              )}
              {actions?.(row)}
            </li>
          )
        })}
        {isEmpty && <li className="px-4 py-10 text-center text-sm text-muted-foreground">{empty}</li>}
      </ul>
    </>
  )
}
```

- [ ] **Step 4: ย้ายหน้าหมวดหมู่มาใช้ `DataTable`**

ใน `CategoriesPage.tsx` แทนบล็อก `<Table>…</Table>` ทั้งก้อนด้วย:

```tsx
          <DataTable
            rows={all}
            rowKey={(category) => category.id}
            isPending={categories.isPending}
            empty={t('list.empty')}
            muted={(category) => !category.isActive}
            columns={[
              { id: 'name', header: t('columns.name'), priority: 'primary', className: 'font-medium', cell: (category) => category.name },
              { id: 'sortOrder', header: t('columns.sortOrder'), priority: 'wide-only', align: 'right', cell: (category) => category.sortOrder },
              {
                id: 'status',
                header: t('columns.status'),
                priority: 'secondary',
                cell: (category) => (
                  <StatusBadge tone={category.isActive ? 'success' : 'neutral'}>
                    {category.isActive ? t('status.active') : t('status.inactive')}
                  </StatusBadge>
                ),
              },
            ]}
            actions={(category) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="size-11" aria-label={t('actions.more', { name: category.name })}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDialog({ category })}>{t('actions.edit')}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setActive(category, !category.isActive)}>
                    {category.isActive ? t('actions.deactivate') : t('actions.activate')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          />
```

ลบ import ของ `Table*` และค่าคงที่ `tableHead`/`tableCell` ที่ไม่ใช้แล้ว เพิ่ม `import { DataTable } from '@/components/DataTable'`

Run: `bun run typecheck && cd apps/web && bun test && bun run lint`
Expected: ผ่าน (เว็บ 89 ข้อ = 87 + 2)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/DataTable.tsx apps/web/src/lib/data-table.ts apps/web/src/lib/data-table.test.ts apps/web/src/features/categories/components/CategoriesPage.tsx
gitcz --non-interactive --type=feat --scope=web --subject="add DataTable, a table that turns into a list on phones" --body="Columns say whether they lead the list item, go on its second line or only show in the table. The categories page is the first to use it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: ตารางที่เหลือใช้ `DataTable`

**Files:**
- Modify: `apps/web/src/features/products/components/ProductsPage.tsx`, `apps/web/src/features/branches/components/BranchesPage.tsx`, `apps/web/src/features/users/components/UsersPage.tsx`, `apps/web/src/features/sales/components/TodayPage.tsx`

**Interfaces:**
- Consumes: `DataTable`, `Column` จาก Task 1

- [ ] **Step 1: ย้ายแต่ละหน้าแบบเดียวกับหน้าหมวดหมู่**

อ่านตารางเดิมของแต่ละหน้าก่อน แล้วแปลงทุกคอลัมน์เป็น `Column` โดยคง `cell` เดิมทุกตัว (ห้ามเปลี่ยนสิ่งที่แสดง) ตั้ง priority ดังนี้ และย้ายเมนูการทำงานของแถวไปไว้ใน `actions` (ปุ่ม `size-11`):

| หน้า | primary | secondary | wide-only |
|---|---|---|---|
| สินค้า | สินค้า (รูปเล็ก ชื่อ รหัส) | ราคา, คงเหลือ, สถานะ | หมวดหมู่, บาร์โค้ด, ต้นทุน และคอลัมน์อื่นที่เหลือ |
| สาขา | ชื่อสาขา | รหัส, สถานะ | ที่อยู่, เบอร์โทร และอื่น ๆ |
| ผู้ใช้ | ชื่อที่แสดง | ชื่อผู้ใช้, บทบาท, สถานะ | สาขา และอื่น ๆ |
| บิลวันนี้ | เลขที่บิล | เวลา, ยอดสุทธิ, สถานะ | พนักงาน และอื่น ๆ |

บิลวันนี้เปิดรายละเอียดเมื่อแตะแถว: ใช้ `onSelect` (แถวในตารางยังคลิกได้เหมือนเดิม) และ `rowLabel` เป็นเลขที่บิล

- [ ] **Step 2: ตรวจ**

Run: `bun run typecheck && bun run lint && bun run e2e`
Expected: ผ่าน 26/26 (`getByRole('row', …)` ของ e2e ยังเจอแถวของตารางที่ 1366px เพราะรายการถูกซ่อนด้วย `display: none` จึงไม่อยู่ใน accessibility tree)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/products/components/ProductsPage.tsx apps/web/src/features/branches/components/BranchesPage.tsx apps/web/src/features/users/components/UsersPage.tsx apps/web/src/features/sales/components/TodayPage.tsx
gitcz --non-interactive --type=feat --scope=web --subject="show the products, branches, users and today's sales as lists on phones" --body="Every table now goes through DataTable, so none of them runs off the side of a phone and each row's menu stays in reach.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: โครงของแอป: sidebar, เมนูล่าง, แถบหัว

**Files:**
- Create: `apps/web/src/app/BottomNav.tsx`
- Modify: `apps/web/src/hooks/use-mobile.ts`, `apps/web/src/app/App.tsx`, `apps/web/src/app/AppSidebar.tsx`, `apps/web/src/components/PageHeader.tsx`, ปุ่มแถบหัวของทุกหน้า (`className="h-9 px-3"` ใน children ของ `PageHeader`), `apps/web/src/locales/common.ts`

- [ ] **Step 1: ช่วงจอของ sidebar**

`hooks/use-mobile.ts`: `MOBILE_BREAKPOINT = 640` (sidebar เป็นแผงซ่อนบนจอ < 640 เท่านั้น)

`App.tsx` ใน `Shell`: `<SidebarProvider defaultOpen={window.matchMedia('(min-width: 1024px)').matches}>` พร้อมคอมเมนต์ว่าแท็บเล็ตเริ่มที่แถบไอคอนเพื่อให้หน้าขายได้พื้นที่ และ `SidebarInset` เพิ่ม `pb-16 sm:pb-0` เพื่อไม่ให้เนื้อหาอยู่ใต้เมนูล่าง

`AppSidebar.tsx`: ปุ่มเมนู `h-9` → `h-11`

- [ ] **Step 2: เมนูล่างบนมือถือ**

`app/BottomNav.tsx`:

```tsx
import { CalendarCheck, Menu, ShoppingCart, WalletCards } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

/** Phones only: the three pages a cashier lives in, and the rest of the menu behind the fourth button. */
export function BottomNav() {
  const { t } = useTranslation()
  const { setOpenMobile } = useSidebar()
  const item = 'flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs'
  const link = ({ isActive }: { isActive: boolean }) => cn(item, isActive ? 'text-primary' : 'text-muted-foreground')

  return (
    <nav aria-label={t('nav.bottom')} className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background pb-[env(safe-area-inset-bottom)] sm:hidden print:hidden">
      <NavLink to="/" end className={link}><ShoppingCart className="size-5" />{t('nav.sell')}</NavLink>
      <NavLink to="/today" className={link}><CalendarCheck className="size-5" />{t('nav.today')}</NavLink>
      <NavLink to="/shifts" className={link}><WalletCards className="size-5" />{t('nav.shifts')}</NavLink>
      <button type="button" className={cn(item, 'text-muted-foreground')} onClick={() => setOpenMobile(true)}>
        <Menu className="size-5" />
        {t('nav.more')}
      </button>
    </nav>
  )
}
```

ข้อความ `nav.sell`, `nav.today`, `nav.shifts` มีอยู่แล้ว (ตรวจว่าอยู่ namespace ไหนก่อนใช้ ถ้าอยู่ namespace อื่นให้ใช้ namespace นั้น) เพิ่ม `nav.more` (`เมนู` / `Menu`) และ `nav.bottom` (`เมนูหลัก` / `Main menu`) ในไฟล์เดียวกัน วาง `<BottomNav />` ใน `Shell` ภายใน `SidebarProvider` ต่อจาก `SidebarInset`

- [ ] **Step 3: แถบหัว**

`PageHeader.tsx`: หัวข้อ `truncate` → `line-clamp-2 sm:truncate` (ไม่ตัดกลางคำบนมือถือ) แถบสูงอย่างน้อย `min-h-16` แทน `h-16` และ `SidebarTrigger` ซ่อนบนมือถือ (`hidden sm:inline-flex`) เพราะมีเมนูล่างแล้ว

ทุกปุ่มที่เป็น children ของ `PageHeader` ในทุกหน้า: `h-9` → `h-11` (หาด้วย `grep -rn 'className="h-9 px-3"' apps/web/src/features`)

- [ ] **Step 4: ตรวจและ commit**

Run: `bun run typecheck && bun run lint && bun run e2e`
Expected: ผ่าน 26/26

```bash
git add apps/web/src/app apps/web/src/hooks/use-mobile.ts apps/web/src/components/PageHeader.tsx apps/web/src/features apps/web/src/locales/common.ts
gitcz --non-interactive --type=feat --scope=web --subject="fit the app shell to tablets and phones" --body="The sidebar starts as an icon rail on tablets and is replaced by a bottom menu on phones. Header buttons are 44px and long titles wrap on phones instead of being cut.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(ก่อน `git add apps/web/src/features` ให้ตรวจ `git status` ว่ามีเฉพาะไฟล์ที่แก้ปุ่มแถบหัว)

---

### Task 4: หน้าขาย: การ์ดสินค้า, แถบตะกร้า, ปุ่มกะ

**Files:**
- Create: `apps/web/src/features/pos/components/CartBar.tsx`
- Modify: `apps/web/src/features/pos/components/PosPage.tsx`, `CartPanel.tsx`, `ProductPicker.tsx`, `apps/web/src/features/pos/locales.ts`

- [ ] **Step 1: การ์ดสินค้า**

`ProductPicker.tsx`: แสดง `<ProductImage>` เฉพาะเมื่อ `product.imageUrl` ไม่เป็น null ชื่อสินค้า `text-sm` → `text-base` และ `min-h-10` → `min-h-12` การ์ดที่ไม่มีรูปมี `pt-1` เพิ่มเพื่อไม่ให้ชิดขอบ ตารางสินค้า `minmax(9.5rem,1fr)` คงไว้

- [ ] **Step 2: ตะกร้าตามขนาดจอ**

`CartPanel.tsx`: เพิ่ม prop `variant?: 'side' | 'sheet'` (ค่าเริ่มต้น `'side'`) `side` คงเหมือนเดิมแต่ซ่อนบนจอ < 1024 (`hidden lg:flex`) ส่วน `sheet` ไม่มีเส้นขอบซ้ายและกว้างเต็ม ชื่อสินค้าในรายการ `text-sm` → `text-base` ช่องส่วนลด `h-10` → `h-11` ปุ่มเก็บออเดอร์ `h-10` → `h-11`

`CartBar.tsx`:

```tsx
import { ShoppingCart } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useFormat } from '@/lib/money'
import { useCart } from '../hooks/useCart'
import { CartPanel } from './CartPanel'

interface Props {
  onPay: () => void
  onSaveOrder: () => void
  paymentAvailable?: boolean
}

/** Below 1024px: the cart's total and the pay button stay under the thumb; a tap opens the whole cart. */
export function CartBar({ onPay, onSaveOrder, paymentAvailable = true }: Props) {
  const { t } = useTranslation('pos')
  const { money } = useFormat()
  const cart = useCart()
  const [isOpen, setIsOpen] = useState(false)
  // Closing first, so the payment dialog never opens underneath the sheet.
  const pay = () => { setIsOpen(false); onPay() }

  return (
    <div className="flex items-center gap-3 border-t bg-background p-3 lg:hidden print:hidden">
      <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setIsOpen(true)}>
        <ShoppingCart className="size-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">{t('cart.itemCount', { count: cart.itemCount })}</span>
          <span className="block text-xl font-semibold tabular-nums">{money.format(cart.totalSatang)}</span>
        </span>
      </button>
      <Button className="h-12 px-6 text-base" disabled={!cart.canPay || !paymentAvailable} onClick={pay}>
        {t('cart.pay')}
      </Button>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="bottom" className="flex max-h-[90svh] flex-col gap-0 p-0 lg:hidden">
          <SheetTitle className="sr-only">{t('cart.title')}</SheetTitle>
          <CartPanel variant="sheet" onPay={pay} onSaveOrder={() => { setIsOpen(false); onSaveOrder() }} paymentAvailable={paymentAvailable} />
        </SheetContent>
      </Sheet>
    </div>
  )
}
```

ตรวจชื่อ hook ของตะกร้า (`useCart`) และ path ของ `useFormat` ให้ตรงกับที่ `CartPanel.tsx` import อยู่ ใช้ path เดียวกัน คีย์ `cart.title` ถ้ายังไม่มีให้เพิ่มใน `locales.ts` (`ตะกร้า` / `Cart`)

`PosPage.tsx`: ส่วนเนื้อหาเปลี่ยนเป็น

```tsx
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row print:hidden">
        <ProductPicker searchRef={searchRef} />
        <CartPanel onPay={() => setIsPaying(true)} onSaveOrder={() => setIsSavingOrder(true)} paymentAvailable={shiftReady === true} />
        <CartBar onPay={() => setIsPaying(true)} onSaveOrder={() => setIsSavingOrder(true)} paymentAvailable={shiftReady === true} />
      </div>
```

ถ้าแท็บเล็ตหมุนเป็นแนวนอนขณะแผงเปิด แผงถูกซ่อนด้วย `lg:hidden` และแผงขวาแสดงแทน จึงไม่มีตะกร้าสองชุดให้เห็นพร้อมกัน

- [ ] **Step 3: ปุ่มบนแถบหัวของหน้าขาย**

ปุ่มกะใช้ `const navigate = useNavigate()` จาก `react-router` และ `onClick={() => navigate('/shifts')}` แทน `window.location.href`

บนมือถือ (< 640) ปุ่มกะ โต๊ะ และออเดอร์ค้างรวมในเมนูเดียว: แสดงปุ่มทั้งสามด้วย `hidden sm:inline-flex` และเพิ่ม `DropdownMenu` ที่มีปุ่ม `size-11 sm:hidden` (`aria-label={t('moreActions')}`) ซึ่งมีสามรายการเดียวกัน (ออเดอร์ค้างแสดงจำนวนด้วย) เพิ่มคีย์ `moreActions` (`การทำงานอื่น` / `More actions`)

- [ ] **Step 4: ตรวจและ commit**

Run: `bun run typecheck && bun run lint && cd apps/web && bun test && cd ../.. && bun run e2e`
Expected: ผ่าน 26/26

```bash
git add apps/web/src/features/pos
gitcz --non-interactive --type=feat --scope=pos --subject="sell from a phone or a portrait tablet with a cart bar" --body="Below 1024px the cart is a bar with the total and the pay button, opening the same cart panel from the bottom. Cards without a picture drop the empty image box, names are 16px, and the shift button no longer reloads the page.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: dialog บนจอเล็ก

**Files:**
- Modify: `apps/web/src/components/ui/dialog.tsx`

- [ ] **Step 1: ปรับ `DialogContent` และ `DialogFooter`**

`DialogContent` เพิ่มใน class พื้นฐาน: `max-h-[calc(100svh-2rem)] overflow-y-auto` (เนื้อหาที่ยาวเลื่อนได้ในตัว dialog ไม่ล้นจอ)

`DialogFooter` เพิ่ม `sticky bottom-0 z-10` (ปุ่มยืนยันติดล่างของ dialog ขณะเลื่อน รวมถึงตอนแป้นพิมพ์เปิดและจอสั้นลง)

- [ ] **Step 2: ตรวจด้วยตาที่ 390px**

เปิดฟอร์มสินค้า ฟอร์มผู้ใช้ และ dialog ชำระเงินที่ 390×844 และ 390×500 (จำลองแป้นพิมพ์เปิด) ด้วยสคริปต์ภาพใน `apps/web/e2e/shots.ts` ปุ่มยืนยันต้องเห็นและกดได้ทุกภาพ ถ้า dialog ใดไม่ใช้ `DialogFooter` และปุ่มหลุดจอ (`PaymentDialog`, `OpenOrdersDialog`, `FloorDialog`, `ReceiptDialog`, `SaleDetailDialog`) ให้ห่อแถวปุ่มของมันด้วย `DialogFooter` บันทึกใน ledger ว่าแก้ตัวไหน

Run: `bun run typecheck && bun run e2e`
Expected: ผ่าน 26/26

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/dialog.tsx apps/web/src/features
gitcz --non-interactive --type=fix --scope=web --subject="keep the confirm buttons of a dialog on screen on short screens" --body="Dialogs scroll inside themselves instead of running off the screen, and their footer stays at the bottom while they do, so the buttons are reachable with the keyboard open.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ผังโต๊ะบนมือถือ

**Files:**
- Modify: `apps/web/src/features/tables/components/TablesPage.tsx`, `apps/web/src/features/tables/locales.ts`

- [ ] **Step 1: รายการโต๊ะแทนผังบนจอ < 640**

ห่อ `<div ref={canvas} …>` ด้วย `hidden sm:block` และเพิ่มก่อนมัน:

```tsx
          <div className="sm:hidden">
            <p className="mb-2 text-sm text-muted-foreground">{t('phoneNote')}</p>
            <ul className="divide-y rounded-xl border bg-background">
              {all.map((table) => (
                <li key={table.id}>
                  <button
                    type="button"
                    aria-pressed={selectedId === table.id}
                    onClick={() => setSelectedId(table.id)}
                    className={cn('flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left', !table.isActive && 'text-muted-foreground')}
                  >
                    <span className="truncate font-medium">{table.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {table.isActive ? t('seats', { count: table.seats }) : t('inactive')}
                    </span>
                  </button>
                </li>
              ))}
              {!tables.isPending && all.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">{t('empty')}</li>}
            </ul>
          </div>
```

เพิ่มคีย์ `phoneNote` (`จัดตำแหน่งโต๊ะบนผังได้บนจอที่ใหญ่กว่านี้ ที่นี่แก้ชื่อ ที่นั่ง และเปิดปิดโต๊ะได้` / `Arrange the floor plan on a larger screen; here you can change a table's name and seats, or turn it on or off.`) แผงรายละเอียดอยู่ใต้รายการตาม grid เดิม (คอลัมน์เดียวบนจอเล็ก)

- [ ] **Step 2: ตรวจและ commit**

Run: `bun run typecheck && bun run lint && bun run e2e`
Expected: ผ่าน 26/26 (เช็กผังโต๊ะของ e2e ทำที่ 1366px)

```bash
git add apps/web/src/features/tables
gitcz --non-interactive --type=feat --scope=tables --subject="list the tables on phones instead of the floor plan" --body="Dragging tables on a 1000 by 700 plan is not practical on a phone, so a phone lists them and edits their details; the plan stays for larger screens.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: ตรวจกันถอยหลัง, ภาพหน้าจอ, เอกสาร

**Files:**
- Modify: `apps/web/e2e/run.ts`, `package.json` (root), `DESIGN.md`, `AGENTS.md`, `docs/superpowers/roadmap.md`, `docs/summary.md`
- Create (commit): `apps/web/e2e/shots.ts` (สคริปต์ภาพ ปรับให้ใช้ `screenshots/` ใต้ root เป็นค่าเริ่มต้นและ git-ignore โฟลเดอร์นั้น)

- [ ] **Step 1: e2e ขายบนมือถือ**

ใน `run.ts` เพิ่มหมวด `'\nPhone, 390 px:'` หลังหมวด Tables และก่อน shift close (ต้องมีกะเปิดอยู่) โดยสร้าง context ใหม่ของ cashier ที่ `viewport: { width: 390, height: 844 }, hasTouch: true` แล้ว:

```ts
    await check('on a phone the cashier sells with the cart bar: add, open the cart, change the quantity, pay', async () => {
      const phone = await signInAt(browser, 'cashier', CASHIER_PASSWORD, { width: 390, height: 844 })
      await phone.getByRole('button', { name: /น้ำดื่ม 600 มล\./ }).first().click()
      await phone.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
      await phone.getByRole('button', { name: /1 ชิ้น/ }).click()
      await phone.getByRole('dialog').getByRole('button', { name: /เพิ่มจำนวน/ }).first().click()
      await phone.getByRole('dialog').getByRole('button', { name: /^ชำระเงิน/ }).click()
      await phone.getByRole('button', { name: 'พอดี' }).click()
      await phone.getByRole('button', { name: 'ยืนยันการชำระ' }).click()
      await phone.getByRole('button', { name: 'ขายรายการต่อไป' }).waitFor()
      await phone.context().close()
    })
```

เพิ่ม `signInAt(browser, username, password, viewport)` โดยแยกจาก `signIn` เดิม (ให้ `signIn` เรียก `signInAt` ที่ 1366×900) ชื่อปุ่มเพิ่มจำนวน ตะกร้า และยอดของ e2e ต้องตรงกับ `aria-label` จริงใน `CartPanel` (ตรวจก่อน) ถ้าเช็ก "สามบิลเงินสด + หนึ่งบิลตัวเลือก" ของรายงานกะเปลี่ยนเพราะบิลใหม่นี้ ให้ปรับยอดที่คาดในเช็กรายงานกะเป็นยอดใหม่ที่คำนวณได้ และเขียนคอมเมนต์ว่าเพิ่มบิลจากมือถือ (ความหมายของเช็กไม่เปลี่ยน)

- [ ] **Step 2: e2e ไม่มีหน้าไหนล้นแนวนอน และเป้ากดของหน้าขาย**

เพิ่มหมวด `'\nEvery page fits the screen:'` ท้ายสุดก่อนเช็กภาษาอังกฤษ:

```ts
    for (const size of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 900 }]) {
      await check(`no page scrolls sideways at ${size.width} px`, async () => {
        await owner.setViewportSize(size)
        const wide: string[] = []
        for (const path of ['/', '/today', '/shifts', '/products', '/categories', '/modifiers', '/tables', '/branches', '/users', '/settings']) {
          await owner.goto(`${WEB}${path}`)
          await owner.waitForLoadState('networkidle')
          const overflow = await owner.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
          if (overflow > 0) wide.push(`${path} (+${overflow}px)`)
        }
        if (wide.length) throw new Error(`Pages wider than the screen: ${wide.join(', ')}`)
      })
    }

    await check('every visible control on the sell screen is at least 44 px tall', async () => {
      await owner.setViewportSize({ width: 768, height: 1024 })
      await owner.goto(WEB)
      await owner.waitForLoadState('networkidle')
      const small = await owner.evaluate(() =>
        [...document.querySelectorAll('main button, main input, main [role="tab"]')]
          .filter((element) => (element as HTMLElement).offsetParent !== null)
          .map((element) => ({ name: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName, height: element.getBoundingClientRect().height }))
          .filter((control) => control.height < 43.5)
          .map((control) => `${control.name} (${Math.round(control.height)}px)`),
      )
      await owner.setViewportSize({ width: 1366, height: 900 })
      if (small.length) throw new Error(`Too small to tap: ${small.join(', ')}`)
    })
```

ตรวจว่าเนื้อหาหน้าอยู่ใน `<main>` (`SidebarInset` render เป็น `main`) ถ้าไม่ใช่ให้ใช้ selector ของ inset แทน ปุ่มที่เช็กนี้พบว่าเล็กเกิน ให้แก้ที่คอมโพเนนต์ (เช่น `SegmentedTabs` ขนาด touch, ปุ่มล้างตะกร้า) ไม่ใช่ลดเกณฑ์ และบันทึกใน ledger

Run: `bun run e2e`
Expected: ผ่านทั้งหมด (26 + 1 มือถือ + 3 ขนาดจอ + 1 เป้ากด = 31)

- [ ] **Step 3: `bun run screenshots`**

ปรับ `apps/web/e2e/shots.ts`: โฟลเดอร์ผลลัพธ์ค่าเริ่มต้น `screenshots/` ที่ root (อาร์กิวเมนต์แรกแทนได้) คอมเมนต์หัวไฟล์อธิบายว่าใช้ฐานข้อมูล `pos_e2e_shots` และไม่แตะฐานข้อมูล dev เพิ่ม `"screenshots": "bun apps/web/e2e/shots.ts"` ใน `package.json` ที่ root และ `screenshots/` ใน `.gitignore` รัน `bun run screenshots` แล้วดูภาพหน้าขาย หน้าสินค้า ผังโต๊ะ และ dialog ชำระเงิน ทั้งสามขนาด
Expected: ไม่มีตะกร้าทับสินค้า ไม่มีตารางล้น ปุ่มยืนยันอยู่ในจอ

- [ ] **Step 4: เอกสาร**

- `DESIGN.md`: เพิ่มหัวข้อ "ขนาดจอและโครงของแอป" (สามช่วง, เมนูหลักของแต่ละช่วง, ตะกร้าแผงขวา/แถบล่าง), "ความหนาแน่น" (หน้าขาย 16px / หน้าจัดการ 14px), และกฎ: ตารางทุกตัวใช้ `DataTable` พร้อม priority, ไม่มีหน้าไหนเลื่อนแนวนอน, เป้ากด 44px ไม่มีข้อยกเว้น, ปุ่มยืนยันของ dialog อยู่ใน `DialogFooter`
- `AGENTS.md`: ตารางคำสั่งเพิ่ม `bun run screenshots` และหัวข้อเว็บเพิ่มบรรทัดว่าหน้าจอใหม่ต้องผ่านเช็กล้นจอของ e2e และใช้ `DataTable`
- roadmap และ summary: บันทึกรอบที่ 1 ของการปรับ design บน `ohmattpon/responsive-layout` พร้อมผลตรวจจริง (จำนวนทดสอบหลังรัน) และรอบถัดไป (หน้าแรกเป็นผังโต๊ะ คู่กับข้อ 9)

- [ ] **Step 5: ตรวจรวมและ commit**

Run: `bun run typecheck && bun run test && bun run lint && (cd apps/web && bunx vite build) && (cd apps/api && bun run openapi:check) && bun run e2e`
Expected: ผ่านทั้งหมด

```bash
git add apps/web/e2e/run.ts
gitcz --non-interactive --type=test --scope=web --subject="check that pages fit every screen and that a phone can sell" --body="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add apps/web/e2e/shots.ts package.json .gitignore
gitcz --non-interactive --type=chore --scope=web --subject="add bun run screenshots for checking screens by eye" --body="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add DESIGN.md AGENTS.md docs/superpowers/roadmap.md docs/summary.md
gitcz --non-interactive --type=docs --scope=web --subject="record the screen size rules in DESIGN.md and the docs" --body="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
