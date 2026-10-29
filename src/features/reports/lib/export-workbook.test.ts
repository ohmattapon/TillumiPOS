import { afterEach, expect, spyOn, test } from 'bun:test'
import { buildReportWorkbook, downloadReportWorkbook, type ReportExportData } from './export-workbook'

const metrics = { saleCount: 1, voidedCount: 0, totalSatang: 10700, vatSatang: 700, discountSatang: 0, costSatang: 6000, netSalesSatang: 10000, profitSatang: 4000 }
const fixture: ReportExportData = {
  report: {
    from: '2026-01-01', to: '2026-01-01', timeZone: 'Asia/Bangkok', scope: 'all', unallocatedLines: 0,
    summary: metrics, days: { items: [{ day: '2026-01-01', ...metrics }], total: 1 },
    byMethod: [{ method: 'cash', amountSatang: 10700 }],
  },
  items: [
    { productId: 1, sku: '00123', productName: '=HYPERLINK("https://example.com")', packSize: 12, quantity: 2, pieces: 24, netSalesSatang: 10000, costSatang: 6000, profitSatang: 4000 },
    { productId: 2, sku: '', productName: 'ฟรี', packSize: 1, quantity: 1, pieces: 1, netSalesSatang: 0, costSatang: 500, profitSatang: -500 },
  ],
  itemTotals: { quantity: 3, pieces: 25, netSalesSatang: 10000, costSatang: 6500, profitSatang: 3500 },
  categories: [
    { categoryId: 1, name: 'ขนม', quantity: 2, netSalesSatang: 8000, costSatang: 5000, profitSatang: 3000, shareBp: 8000 },
    { categoryId: null, name: null, quantity: 1, netSalesSatang: 2000, costSatang: 1500, profitSatang: 500, shareBp: 2000 },
    { categoryId: 9, name: null, quantity: 0, netSalesSatang: 0, costSatang: 0, profitSatang: 0, shareBp: 0 },
  ],
  categoryTotals: { quantity: 3, netSalesSatang: 10000, costSatang: 6500, profitSatang: 3500 },
  promotions: [{ promotionId: 2, name: 'ซื้อ 2 แถม 1', bills: 3, discountSatang: 5000, netSalesSatang: 30000 }],
  promotionTotals: { bills: 3, discountSatang: 5000, netSalesSatang: 30000 },
  completedBills: 8,
  filters: {},
  currency: 'THB', fractionDigits: 2, locale: 'th',
}
test('XLSX roundtrip keeps money numeric, Thai text and SKU intact, and formula-looking names literal', async () => {
  const workbook = await buildReportWorkbook(fixture)
  const bytes = await workbook.xlsx.writeBuffer()
  const { default: ExcelJS } = await import('exceljs')
  const loaded = new ExcelJS.Workbook()
  await loaded.xlsx.load(bytes)
  expect(loaded.worksheets.length).toBe(6)
  const daily = loaded.getWorksheet('รายวัน')!
  expect(daily.getCell('C2').value).toBe(107)
  expect(daily.getCell('G2').value).toBe(40)
  const products = loaded.getWorksheet('สินค้า')!
  expect(products.getCell('A2').value).toBe('00123')
  expect(products.getCell('B2').value).toBe(fixture.items[0]!.productName)
  expect(products.getCell('B2').type).toBe(ExcelJS.ValueType.String)
}, 30000)
test('a zero-decimal currency is exported without scaling its values', async () => {
  const workbook = await buildReportWorkbook({ ...fixture, locale: 'en', currency: 'JPY', fractionDigits: 0 })
  expect(workbook.getWorksheet('Daily')!.getCell('C2').value).toBe(10700)
  expect(workbook.getWorksheet('Daily')!.getCell('C2').numFmt).toBe('#,##0')
})

const globals = globalThis as { document?: unknown }
const nativeDocument = globals.document
const nativeCreateObjectUrl = URL.createObjectURL
const nativeRevokeObjectUrl = URL.revokeObjectURL
afterEach(() => {
  globals.document = nativeDocument
  URL.createObjectURL = nativeCreateObjectUrl
  URL.revokeObjectURL = nativeRevokeObjectUrl
})

test('the download is an .xlsx file named after the period, scope and time', async () => {
  const link = { href: '', download: '', clicked: false, click() { this.clicked = true } }
  const blobs: Blob[] = []
  globals.document = { createElement: () => link }
  URL.createObjectURL = (blob) => (blobs.push(blob as Blob), 'blob:report')
  const revoked: string[] = []
  URL.revokeObjectURL = (url) => void revoked.push(url)
  const timers: [() => void, number][] = []
  const timer = spyOn(globalThis, 'setTimeout').mockImplementation(((run: () => void, ms: number) => timers.push([run, ms])) as unknown as typeof setTimeout)

  try {
    await downloadReportWorkbook(fixture)
  } finally {
    timer.mockRestore()
  }

  expect(link.href).toBe('blob:report')
  expect(link.download).toMatch(/^sales-2026-01-01-2026-01-01-all-\d{8}T\d{9}Z\.xlsx$/)
  expect(link.clicked).toBe(true)
  expect(blobs[0]!.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  expect(blobs[0]!.size).toBeGreaterThan(0)
  // The address is released a second later, once the browser has started the download.
  expect(revoked).toEqual([])
  expect(timers[0]![1]).toBe(1000)
  timers[0]![0]()
  expect(revoked).toEqual(['blob:report'])
}, 30000)

test('the promotions sheet is always present, with a totals row and the usage line', async () => {
  const workbook = await buildReportWorkbook(fixture)
  const sheet = workbook.getWorksheet('โปรโมชัน')!
  expect(sheet.getCell('A2').value).toBe('ซื้อ 2 แถม 1')
  expect(sheet.getCell('B2').value).toBe(3)
  expect(sheet.getCell('C2').value).toBe(50)
  expect(sheet.getCell('D2').value).toBe(300)
  expect(sheet.getRow(3).getCell(1).value).toBe('รวมทุกโปรโมชัน')
  expect(sheet.getRow(3).font?.bold).toBe(true)
  expect(sheet.getCell('C3').value).toBe(50)
  expect(sheet.getCell('A5').value).toBe('มี 3 จาก 8 บิลที่ใช้โปรโมชัน')
}, 30000)

const names = (workbook: Awaited<ReturnType<typeof buildReportWorkbook>>) => workbook.worksheets.map((sheet) => sheet.name)
test('the sheets come in the same order from every tab, named from the locale', async () => {
  expect(names(await buildReportWorkbook(fixture))).toEqual(['สรุป', 'รายวัน', 'สินค้า', 'หมวดหมู่', 'โปรโมชัน', 'การชำระเงิน'])
  expect(names(await buildReportWorkbook({ ...fixture, locale: 'en' }))).toEqual(['Summary', 'Daily', 'Products', 'Categories', 'Promotions', 'Payments'])
}, 30000)
test('sheet names fit Excel: 31 characters at most and none of the forbidden characters', async () => {
  const forbidden = ['\\', '/', '?', '*', '[', ']', ':']
  for (const locale of ['th', 'en'] as const) {
    for (const name of names(await buildReportWorkbook({ ...fixture, locale }))) {
      expect(name.length).toBeLessThanOrEqual(31)
      expect(forbidden.some((character) => name.includes(character))).toBe(false)
    }
  }
}, 30000)
test('no text carries a middle dot', async () => {
  for (const locale of ['th', 'en'] as const) {
    const workbook = await buildReportWorkbook({ ...fixture, locale, report: { ...fixture.report, unallocatedLines: 2, previous: metrics } })
    workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => {
      if (typeof cell.value === 'string') expect(cell.value).not.toContain('·')
    })))
  }
}, 30000)
test('the products sheet has the screen columns, a margin that is empty at zero net sales, and the totals row', async () => {
  const sheet = (await buildReportWorkbook({ ...fixture, locale: 'en' })).getWorksheet('Products')!
  expect(sheet.getRow(1).values).toEqual([undefined, 'SKU', 'Product', 'Pack size', 'Quantity sold', 'Pieces', 'Sales excluding VAT', 'Product costs', 'Gross profit', 'Margin'])
  expect(sheet.getRow(2).getCell(3).value).toBe(12)
  expect(sheet.getRow(2).getCell(5).value).toBe(24)
  expect(sheet.getRow(2).getCell(6).value).toBe(100)
  expect(sheet.getRow(2).getCell(9).value).toBe(0.4)
  expect(sheet.getRow(2).getCell(9).numFmt).toBe('0.0%')
  expect(sheet.getRow(3).getCell(1).value).toBe('')
  expect(sheet.getRow(3).getCell(9).value).toBeNull()
  const total = sheet.getRow(4)
  expect(total.font?.bold).toBe(true)
  expect([4, 5, 6, 7, 8, 9].map((column) => total.getCell(column).value)).toEqual([3, 25, 100, 65, 35, 0.35])
})
test('the categories sheet labels a missing and a deleted category, shows the share and the totals row', async () => {
  const sheet = (await buildReportWorkbook({ ...fixture, locale: 'en' })).getWorksheet('Categories')!
  expect([2, 3, 4].map((row) => sheet.getRow(row).getCell(1).value)).toEqual(['ขนม', 'No category', 'Deleted category'])
  expect(sheet.getRow(2).getCell(7).value).toBe(0.8)
  expect(sheet.getRow(4).getCell(6).value).toBeNull()
  const total = sheet.getRow(5)
  expect(total.getCell(1).value).toBe('All categories')
  expect(total.font?.bold).toBe(true)
  expect([2, 3, 4, 5, 6].map((column) => total.getCell(column).value)).toEqual([3, 100, 65, 35, 0.35])
})
test('the daily and payment sheets end with a bold totals row', async () => {
  const workbook = await buildReportWorkbook({ ...fixture, locale: 'en' })
  const daily = workbook.getWorksheet('Daily')!
  expect(daily.getRow(3).getCell(1).value).toBe('Whole period')
  expect(daily.getRow(3).font?.bold).toBe(true)
  expect(daily.getRow(3).getCell(3).value).toBe(107)
  const methods = workbook.getWorksheet('Payments')!
  expect(methods.getRow(3).getCell(1).value).toBe('All methods')
  expect(methods.getRow(3).getCell(2).value).toBe(107)
  expect(methods.getRow(3).font?.bold).toBe(true)
})
test('every table still exports when it is empty, with no totals row', async () => {
  const workbook = await buildReportWorkbook({
    ...fixture, items: [], categories: [], promotions: [], completedBills: 0,
    itemTotals: { quantity: 0, pieces: 0, netSalesSatang: 0, costSatang: 0, profitSatang: 0 },
    categoryTotals: { quantity: 0, netSalesSatang: 0, costSatang: 0, profitSatang: 0 },
    promotionTotals: { bills: 0, discountSatang: 0, netSalesSatang: 0 },
    report: { ...fixture.report, days: { items: [], total: 0 } },
  })
  expect(workbook.getWorksheet('สินค้า')!.rowCount).toBe(1)
  expect(workbook.getWorksheet('หมวดหมู่')!.rowCount).toBe(1)
  expect(workbook.getWorksheet('รายวัน')!.rowCount).toBe(1)
  await workbook.xlsx.writeBuffer()
}, 30000)

const lines = (sheet: { eachRow: (callback: (row: { values: unknown }) => void) => void }) => {
  const out: unknown[][] = []
  sheet.eachRow((row) => out.push((row.values as unknown[]).slice(1)))
  return out
}
test('the summary lists the filters in force', async () => {
  const plain = lines((await buildReportWorkbook({ ...fixture, locale: 'en' })).getWorksheet('Summary')!)
  expect(plain).toContainEqual(['Cashier', 'All cashiers'])
  expect(plain).toContainEqual(['Customer', 'Members and guests'])
  expect(plain).toContainEqual(['Period', '2026-01-01 - 2026-01-01'])
  const narrowed = lines((await buildReportWorkbook({
    ...fixture, locale: 'en', filters: { cashierName: 'Somchai', customer: 'member', categoryName: 'Snacks' },
  })).getWorksheet('Summary')!)
  expect(narrowed).toContainEqual(['Cashier', 'Somchai'])
  expect(narrowed).toContainEqual(['Customer', 'Members only'])
  expect(narrowed).toContainEqual(['Category', 'Snacks'])
  const guests = lines((await buildReportWorkbook({ ...fixture, locale: 'en', filters: { customer: 'guest' } })).getWorksheet('Summary')!)
  expect(guests).toContainEqual(['Customer', 'Guests only'])
}, 30000)
test('the previous period and the change appear only when the comparison is on', async () => {
  const off = (await buildReportWorkbook({ ...fixture, locale: 'en' })).getWorksheet('Summary')!
  expect(off.getRow(1).values).toEqual([undefined, 'Summary', 'THB'])
  expect(off.getCell('C9').value).toBeNull()
  const before = { ...metrics, totalSatang: 8560, saleCount: 0, profitSatang: 4000 }
  const on = (await buildReportWorkbook({ ...fixture, locale: 'en', report: { ...fixture.report, previous: before } })).getWorksheet('Summary')!
  expect(on.getRow(1).values).toEqual([undefined, 'Summary', 'THB', 'Previous period', 'Change'])
  // Revenue is row 9: 107.00 against 85.60 is up 25%.
  expect(on.getCell('B9').value).toBe(107)
  expect(on.getCell('C9').value).toBe(85.6)
  expect(on.getCell('D9').value).toBe(0.25)
  expect(on.getCell('D9').numFmt).toBe('0.0%')
  // A previous period with no bills cannot be compared, so the change is a dash.
  expect(on.getCell('D7').value).toBe('—')
  expect(on.getCell('D10').value).toBe(0)
}, 30000)
test('the unallocated note appears only when lines have no share yet', async () => {
  const none = lines((await buildReportWorkbook({ ...fixture, locale: 'en' })).getWorksheet('Summary')!)
  expect(none.some((row) => String(row[0]).includes('no share yet'))).toBe(false)
  const some = lines((await buildReportWorkbook({ ...fixture, locale: 'en', report: { ...fixture.report, unallocatedLines: 4 } })).getWorksheet('Summary')!)
  expect(some.some((row) => String(row[0]).startsWith('4 lines of earlier sales have no share yet'))).toBe(true)
}, 30000)
test('every amount in every sheet is a number, never text', async () => {
  const workbook = await buildReportWorkbook(fixture)
  const products = workbook.getWorksheet('สินค้า')!
  for (const row of [2, 3, 4]) for (const column of [4, 5, 6, 7, 8]) expect(typeof products.getRow(row).getCell(column).value).toBe('number')
  expect(typeof workbook.getWorksheet('หมวดหมู่')!.getRow(2).getCell(3).value).toBe('number')
  expect(typeof workbook.getWorksheet('สรุป')!.getCell('B9').value).toBe('number')
  expect(typeof workbook.getWorksheet('การชำระเงิน')!.getCell('B2').value).toBe('number')
}, 30000)
