import { afterEach, expect, spyOn, test } from 'bun:test'
import { buildReportWorkbook, downloadReportWorkbook, type ReportExportData } from './export-workbook'

const metrics = { saleCount: 1, voidedCount: 0, totalSatang: 10700, vatSatang: 700, discountSatang: 0, costSatang: 6000, netSalesSatang: 10000, profitSatang: 4000 }
const fixture: ReportExportData = {
  report: {
    from: '2026-01-01', to: '2026-01-01', timeZone: 'Asia/Bangkok', scope: 'all',
    summary: metrics, days: { items: [{ day: '2026-01-01', ...metrics }], total: 1 },
    byMethod: [{ method: 'cash', amountSatang: 10700 }],
  },
  products: [{ productId: 1, sku: '00123', productName: '=HYPERLINK("https://example.com")', quantity: 2, lineTotalSatang: 10700 }],
  currency: 'THB', fractionDigits: 2, locale: 'th',
}
test('XLSX roundtrip keeps money numeric, Thai text and SKU intact, and formula-looking names literal', async () => {
  const workbook = await buildReportWorkbook(fixture)
  const bytes = await workbook.xlsx.writeBuffer()
  const { default: ExcelJS } = await import('exceljs')
  const loaded = new ExcelJS.Workbook()
  await loaded.xlsx.load(bytes)
  expect(loaded.worksheets.length).toBe(4)
  const daily = loaded.getWorksheet('รายวัน')!
  expect(daily.getCell('C2').value).toBe(107)
  expect(daily.getCell('G2').value).toBe(40)
  const products = loaded.getWorksheet('สินค้า')!
  expect(products.getCell('A2').value).toBe('00123')
  expect(products.getCell('B2').value).toBe(fixture.products[0]!.productName)
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

test('adds a promotions sheet with one row per promotion', async () => {
  const workbook = await buildReportWorkbook({
    ...fixture,
    promotions: [
      { promotionId: 2, name: 'ซื้อ 2 แถม 1', bills: 3, discountSatang: 5000, netSalesSatang: 30000 },
      { promotionId: 1, name: 'คูปองลด 10%', bills: 1, discountSatang: 2000, netSalesSatang: 9000 },
    ],
  })
  const sheet = workbook.getWorksheet('โปรโมชัน')!
  expect(workbook.worksheets.length).toBe(5)
  expect(sheet.getCell('A2').value).toBe('ซื้อ 2 แถม 1')
  expect(sheet.getCell('B2').value).toBe(3)
  expect(sheet.getCell('C2').value).toBe(50)
  expect(sheet.getCell('D2').value).toBe(300)
}, 30000)
