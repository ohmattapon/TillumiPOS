import { describe, expect, test } from 'bun:test'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { common } from '@/locales/common'
import type { Column } from '@/lib/data-table'
import { DataTable } from './DataTable'

await i18n.use(initReactI18next).init({
  resources: { th: { common: common.th } },
  lng: 'th',
  fallbackLng: 'th',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

const columns = [
  { id: 'name', header: 'ชื่อ', priority: 'primary', cell: (row: { name: string }) => row.name },
] as const

describe('DataTable (roomy rows)', () => {
  const html = () =>
    renderToStaticMarkup(
      <DataTable
        columns={columns.map((c) => ({ ...c }))}
        rows={[{ name: 'กาแฟ' }]}
        rowKey={(row) => row.name}
        empty="ไม่มีข้อมูล"
      />,
    )

  test('rows are roomy (about 52px) with hover', () => {
    expect(html()).toMatch(/<td[^>]*px-4 py-4/)
    expect(html()).toMatch(/<th[^>]*h-11 px-4/)
    expect(html()).toContain('hover:bg-muted/50')
  })

  test('header cells have no vertical divider', () => {
    expect(html()).not.toContain('border-r')
  })

  test('row dividers are faint', () => {
    expect(html()).toMatch(/<tr[^>]*border-border\/60[^>]*hover:bg-muted\/50|<tr[^>]*hover:bg-muted\/50[^>]*border-border\/60/)
  })
})

interface Row { id: number; name: string }

const render = (props: Partial<Parameters<typeof DataTable<Row>>[0]> & { columns?: Column<Row>[] } = {}) =>
  renderToStaticMarkup(
    <DataTable<Row>
      columns={[{ id: 'name', header: 'ชื่อ', priority: 'primary', cell: (row) => row.name }]}
      rows={[{ id: 1, name: 'กาแฟ' }]}
      rowKey={(row) => row.id}
      empty="ไม่มีข้อมูล"
      {...props}
    />,
  )

const occurrences = (html: string, text: string) => html.split(text).length - 1

describe('DataTable behavior', () => {
  test('renders a row whose key is 0', () => {
    expect(render({ rows: [{ id: 0, name: 'Zero' }] })).toContain('Zero')
  })

  test('each row is a real tr with its cells and the actions cell', () => {
    const html = render({
      rows: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
      actions: (row) => <button type="button">{`act-${row.name}`}</button>,
    })

    expect(occurrences(html, '<tr')).toBe(3)
    expect(html).toContain('act-A')
    expect(html).toContain('act-B')
  })

  test('wide-only columns are hidden below 1024px in the header and in every cell', () => {
    const html = render({
      columns: [
        { id: 'name', header: 'ชื่อ', priority: 'primary', cell: (row) => row.name },
        { id: 'wide', header: 'WIDEHEAD', priority: 'wide-only', cell: () => 'WIDECELL' },
      ],
    })

    expect(html).toMatch(/<th[^>]*hidden lg:table-cell[^>]*>WIDEHEAD/)
    expect(html).toMatch(/<td[^>]*hidden lg:table-cell[^>]*>WIDECELL/)
  })

  test('the phone list leaves wide-only columns out and keeps primary and secondary', () => {
    const html = render({
      columns: [
        { id: 'p', header: 'p', priority: 'primary', cell: () => 'PCELL' },
        { id: 's', header: 's', priority: 'secondary', cell: () => 'SCELL' },
        { id: 'w', header: 'w', priority: 'wide-only', cell: () => 'WCELL' },
      ],
    })

    expect(occurrences(html, 'PCELL')).toBe(2)
    expect(occurrences(html, 'SCELL')).toBe(2)
    expect(occurrences(html, 'WCELL')).toBe(1)
  })

  test('an empty table spans every column including the actions column', () => {
    const html = render({
      rows: [],
      actions: () => null,
      columns: [
        { id: 'a', header: 'a', priority: 'primary', cell: () => 'a' },
        { id: 'b', header: 'b', priority: 'secondary', cell: () => 'b' },
      ],
    })

    expect(html).toContain('colSpan="3"')
    expect(html).toContain('ไม่มีข้อมูล')
  })

  test('a selectable row is reachable from the keyboard', () => {
    expect(render({ onSelect: () => {} })).toContain('tabindex="0"')
    expect(render()).not.toContain('tabindex="0"')
  })

  test('a muted row is dimmed', () => {
    expect(render({ muted: () => true })).toMatch(/<tr[^>]*text-muted-foreground/)
    expect(render()).not.toMatch(/<tr[^>]*text-muted-foreground/)
  })
})

describe('DataTable toolbar', () => {
  const toolbar = <span>find-me</span>

  test('renders the toolbar exactly once, not in both the table and the phone list', () => {
    expect(occurrences(render({ toolbar }), 'find-me')).toBe(1)
  })

  test('keeps the toolbar while loading', () => {
    expect(occurrences(render({ toolbar, isPending: true }), 'find-me')).toBe(1)
  })

  test('keeps the toolbar when there are no rows', () => {
    expect(occurrences(render({ toolbar, rows: [] }), 'find-me')).toBe(1)
  })

  test('renders no toolbar wrapper when none is given', () => {
    expect(render()).not.toContain('border-b px-4 py-3')
  })
})
