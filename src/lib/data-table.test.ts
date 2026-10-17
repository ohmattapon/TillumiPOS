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
