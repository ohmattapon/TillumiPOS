import { percentChange } from '@pos/api/reports'
import type { SalesReport } from '@pos/api/types'
import type { Locale } from '@/lib/money'
import { reportsLocales } from '../locales'
import { categoryLabel, marginBp } from './report-format'
import type { CategoryTotals, ItemTotals } from './report-totals'
import type { PromotionTotals } from './promotion-totals'

export interface ReportPromotionRow {
  promotionId: number
  name: string
  bills: number
  discountSatang: number
  netSalesSatang: number
}
export interface ReportItemRow {
  productId: number
  sku: string
  productName: string
  packSize: number
  quantity: number
  pieces: number
  netSalesSatang: number
  costSatang: number
  profitSatang: number
}
export interface ReportCategoryRow {
  categoryId: number | null
  name: string | null
  quantity: number
  netSalesSatang: number
  costSatang: number
  profitSatang: number
  shareBp: number
}
/** The filters in force, named for the reader of the file. A missing cashier or customer means all. */
export interface ReportExportFilters {
  cashierName?: string
  customer?: 'member' | 'guest'
  /** Set only when the Products tab had a category chosen, since that narrows the products sheet alone. */
  categoryName?: string
}
export interface ReportExportData {
  /** The overview. Its `previous` is present only when the comparison was asked for. */
  report: SalesReport
  items: ReportItemRow[]
  itemTotals: ItemTotals
  categories: ReportCategoryRow[]
  categoryTotals: CategoryTotals
  promotions: ReportPromotionRow[]
  promotionTotals: PromotionTotals
  completedBills: number
  filters: ReportExportFilters
  currency: string
  fractionDigits: number
  locale: Locale
}
type Cell = string | number | Date | null
interface SheetOptions {
  money?: number[]
  percent?: number[]
  integer?: number[]
  /** Drawn in bold after the rows and kept out of the filter, so sorting never moves it. */
  totals?: Cell[]
}
const PERCENT_FORMAT = '0.0%'
/** Build a real XLSX with numeric amounts and literal strings, never user-supplied formulas. */
export async function buildReportWorkbook(data: ReportExportData) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'TillumiPOS'
  workbook.created = new Date()
  const t = reportsLocales[data.locale]
  const factor = 10 ** data.fractionDigits
  const numberFormat = data.fractionDigits ? '#,##0.' + '0'.repeat(data.fractionDigits) : '#,##0'
  const amount = (value: number) => value / factor
  /** Basis points as a spreadsheet fraction, so the cell is a number shown as a percent. */
  const fraction = (bp: number | null) => bp === null ? null : bp / 10000 || 0
  function sheet(name: string, headers: string[], rows: Cell[][], options: SheetOptions = {}) {
    const result = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
    result.addRow(headers)
    result.addRows(rows)
    if (options.totals) result.addRow(options.totals)
    result.columns.forEach((column, index) => {
      column.width = index === 0 ? 30 : 22
      const position = index + 1
      if (options.money?.includes(position)) column.numFmt = numberFormat
      if (options.percent?.includes(position)) column.numFmt = PERCENT_FORMAT
      if (options.integer?.includes(position)) column.numFmt = '#,##0'
    })
    result.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    result.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }
    if (options.totals) result.getRow(result.rowCount).font = { bold: true }
    result.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + rows.length, column: headers.length } }
    return result
  }
  const s = data.report.summary
  const previous = data.report.previous
  const average = (sums: { totalSatang: number; saleCount: number }) => sums.saleCount ? Math.round(sums.totalSatang / sums.saleCount) : 0
  const lastColumn = previous ? 4 : 2
  // Each figure: label, current, previous, whether it is money. The comparison columns exist only with a previous period.
  const figures: [string, number, number | undefined, boolean][] = [
    [t.bills, s.saleCount, previous?.saleCount, false], [t.voidedBills, s.voidedCount, previous?.voidedCount, false],
    [t.revenue, s.totalSatang, previous?.totalSatang, true], [t.vat, s.vatSatang, previous?.vatSatang, true],
    [t.netSales, s.netSalesSatang, previous?.netSalesSatang, true], [t.discount, s.discountSatang, previous?.discountSatang, true],
    [t.cost, s.costSatang, previous?.costSatang, true], [t.profit, s.profitSatang, previous?.profitSatang, true],
    [t.average, average(s), previous && average(previous), true],
  ]
  const figureRow = ([label, current, before, money]: (typeof figures)[number]): Cell[] => {
    const shown = (value: number) => money ? amount(value) : value
    if (!previous || before === undefined) return [label, shown(current)]
    return [label, shown(current), shown(before), fraction(percentChange(current, before)) ?? '—']
  }
  const customerText = data.filters.customer === 'member' ? t.memberCustomers
    : data.filters.customer === 'guest' ? t.guestCustomers : t.allCustomers
  const rows: Cell[][] = [
    [t.from, data.report.from], [t.to, data.report.to],
    [t.zone.replace('{{zone}}', data.report.timeZone), ''], [t.currency, data.currency],
    [t.generated, new Date().toISOString()],
    ...figures.map(figureRow),
    [t.filtersHeading, ''],
    [t.period, `${data.report.from} - ${data.report.to}`],
    [t.cashier, data.filters.cashierName ?? t.allCashiers],
    [t.customer, customerText],
    ...(data.filters.categoryName === undefined ? [] : [[t.category, data.filters.categoryName]]),
  ]
  const noteRows: string[] = [
    ...(data.report.unallocatedLines > 0 ? [t.exportUnallocated.replace('{{count}}', String(data.report.unallocatedLines))] : []),
    t.basis + '\n' + t.itemsNote,
  ]
  const headers = previous ? [t.summarySheet, data.currency, t.previousPeriod, t.change] : [t.summarySheet, data.currency]
  const summarySheet = sheet(t.summarySheet, headers, [...rows, ...noteRows.map((note): Cell[] => [note, ''])])
  summarySheet.autoFilter = undefined
  summarySheet.getColumn(1).width = 34
  // Rows 2 to 6 are the period header lines, then the nine figures in the order of `figures`.
  figures.forEach(([, , , money], index) => {
    const row = 7 + index
    const format = money ? numberFormat : '#,##0'
    summarySheet.getCell(row, 2).numFmt = format
    if (previous) {
      summarySheet.getCell(row, 3).numFmt = format
      summarySheet.getCell(row, 4).numFmt = PERCENT_FORMAT
      summarySheet.getCell(row, 4).alignment = { horizontal: 'right' }
    }
  })
  summarySheet.getRow(7 + figures.length).font = { bold: true }
  noteRows.forEach((_, index) => {
    const noteRow = rows.length + 2 + index
    summarySheet.mergeCells(noteRow, 1, noteRow, lastColumn)
    summarySheet.getCell(noteRow, 1).alignment = { wrapText: true, vertical: 'top' }
    summarySheet.getRow(noteRow).height = index === noteRows.length - 1 ? 72 : 36
  })

  const days = data.report.days.items
  sheet(t.dailySheet, [t.day, t.bills, t.revenue, t.vat, t.netSales, t.cost, t.profit],
    days.map((row) => [row.day, row.saleCount, amount(row.totalSatang), amount(row.vatSatang), amount(row.netSalesSatang), amount(row.costSatang), amount(row.profitSatang)]),
    {
      money: [3, 4, 5, 6, 7], integer: [2],
      totals: days.length ? [t.dailyTotal, s.saleCount, amount(s.totalSatang), amount(s.vatSatang), amount(s.netSalesSatang), amount(s.costSatang), amount(s.profitSatang)] : undefined,
    })

  const tt = data.itemTotals
  sheet(t.productsSheet, [t.sku, t.product, t.pack, t.quantity, t.pieces, t.netSales, t.cost, t.profit, t.margin],
    data.items.map((row) => [row.sku, row.productName, row.packSize, row.quantity, row.pieces, amount(row.netSalesSatang), amount(row.costSatang), amount(row.profitSatang), fraction(marginBp(row.profitSatang, row.netSalesSatang))]),
    {
      money: [6, 7, 8], percent: [9], integer: [3, 4, 5],
      totals: data.items.length ? ['', t.itemsTotal, '', tt.quantity, tt.pieces, amount(tt.netSalesSatang), amount(tt.costSatang), amount(tt.profitSatang), fraction(marginBp(tt.profitSatang, tt.netSalesSatang))] : undefined,
    })

  const ct = data.categoryTotals
  const labels = { none: t.noCategory, deleted: t.deletedCategory }
  sheet(t.categoriesSheet, [t.categoryName, t.quantity, t.netSales, t.cost, t.profit, t.margin, t.share],
    data.categories.map((row) => [categoryLabel(row, labels), row.quantity, amount(row.netSalesSatang), amount(row.costSatang), amount(row.profitSatang), fraction(marginBp(row.profitSatang, row.netSalesSatang)), fraction(row.shareBp)]),
    {
      money: [3, 4, 5], percent: [6, 7], integer: [2],
      totals: data.categories.length ? [t.categoriesTotal, ct.quantity, amount(ct.netSalesSatang), amount(ct.costSatang), amount(ct.profitSatang), fraction(marginBp(ct.profitSatang, ct.netSalesSatang)), null] : undefined,
    })

  const pt = data.promotionTotals
  const promotionsSheet = sheet(t.promotionsSheet, [t.promotionName, t.promotionBills, t.promotionDiscount, t.promotionNetSales],
    data.promotions.map((row) => [row.name, row.bills, amount(row.discountSatang), amount(row.netSalesSatang)]),
    {
      money: [3, 4], integer: [2],
      totals: data.promotions.length ? [t.promotionTotal, pt.bills, amount(pt.discountSatang), amount(pt.netSalesSatang)] : undefined,
    })
  promotionsSheet.addRow([])
  promotionsSheet.addRow([t.promotionUsage.replace('{{used}}', String(pt.bills)).replace('{{all}}', String(data.completedBills))])

  sheet(t.methodsSheet, [t.methods, data.currency],
    data.report.byMethod.map((row) => [t[row.method], amount(row.amountSatang)]),
    { money: [2], totals: [t.methodsTotal, amount(s.totalSatang)] })
  return workbook
}
export async function downloadReportWorkbook(data: ReportExportData) {
  const workbook = await buildReportWorkbook(data)
  const bytes = await workbook.xlsx.writeBuffer()
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const stamp = new Date().toISOString().replace(/[-:.]/g, '')
  link.download = `sales-${data.report.from}-${data.report.to}-${data.report.scope}-${stamp}.xlsx`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
