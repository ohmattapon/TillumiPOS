import { expect, test } from 'bun:test'
import { collectPages, collectPagesWith } from './collect-pages'
test('exports beyond the API page size, and preserves every row', async () => {
  const source = Array.from({ length: 1001 }, (_, i) => i)
  const offsets: number[] = []
  const result = await collectPages(async (offset, limit) => {
    offsets.push(offset)
    return { items: source.slice(offset, offset + limit), total: source.length }
  })
  expect(result).toEqual(source)
  expect(offsets).toEqual([0, 500, 1000])
})
test('empty periods return an empty export', async () => {
  expect(await collectPages(async () => ({ items: [], total: 0 }))).toEqual([])
})
test('refuses a result set whose count changes during pagination', async () => {
  await expect(collectPages(async (offset) => offset ? { items: [2], total: 3 } : { items: [1], total: 2 })).rejects.toThrow('REPORT_CHANGED')
})
test('a missing page cannot silently truncate the export or loop forever', async () => {
  await expect(collectPages(async () => ({ items: [], total: 1 }))).rejects.toThrow('REPORT_CHANGED')
})
test('collectPagesWith returns the totals of the pages beside the rows', async () => {
  const source = Array.from({ length: 501 }, (_, i) => i)
  const result = await collectPagesWith(
    async (offset, limit) => ({ items: source.slice(offset, offset + limit), total: source.length, totals: { sum: 7 } }),
    (page) => page.totals,
  )
  expect(result.items).toEqual(source)
  expect(result.extra).toEqual({ sum: 7 })
})
test('collectPagesWith refuses totals that change between pages', async () => {
  const source = Array.from({ length: 501 }, (_, i) => i)
  await expect(collectPagesWith(
    async (offset, limit) => ({ items: source.slice(offset, offset + limit), total: source.length, n: offset }),
    (page) => page.n,
  )).rejects.toThrow('REPORT_CHANGED')
})
test('collectPagesWith works for an empty period', async () => {
  const result = await collectPagesWith(async () => ({ items: [] as number[], total: 0 }), () => 'x')
  expect(result).toEqual({ items: [], extra: 'x' })
})
