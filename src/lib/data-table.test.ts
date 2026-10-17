import { describe, expect, test } from 'bun:test'
import type { CellContext } from '@tanstack/react-table'
import { splitColumns, toColumnDefs, type Column } from './data-table'

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

describe('toColumnDefs', () => {
  interface Row { name: string }
  const columns: Column<Row>[] = [
    { id: 'name', header: 'Name', cell: (row) => row.name, priority: 'primary' },
    { id: 'price', header: 'Price', cell: () => '10', priority: 'secondary', align: 'right' },
  ]

  test("keeps each column's id and header, in order", () => {
    const defs = toColumnDefs(columns)

    expect(defs.map((def) => def.id)).toEqual(['name', 'price'])
    expect(defs.map((def) => def.header)).toEqual(['Name', 'Price'])
  })

  test("renders a cell by calling the column's cell with the row", () => {
    const [name] = toColumnDefs(columns)
    const context = { row: { original: { name: 'Coffee' } } } as unknown as CellContext<Row, unknown>

    expect((name.cell as (context: CellContext<Row, unknown>) => unknown)(context)).toBe('Coffee')
  })

  test('hands the original column back through meta', () => {
    const defs = toColumnDefs(columns)

    expect(defs[1].meta?.column).toBe(columns[1])
  })
})
