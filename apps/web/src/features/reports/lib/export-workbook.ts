import type { SalesReport, ReportProduct, ReportBranch } from '@pos/api/types'
import type { Locale } from '@/lib/money'
import { reportsLocales } from '../locales'

export interface ReportExportData {
  report: SalesReport
  products: ReportProduct[]
  branches: ReportBranch[]
  branchName: string
  currency: string
  fractionDigits: number
  locale: Locale
}
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
  function sheet(name: string, headers: string[], rows: (string | number | Date)[][], moneyColumns: number[]) {
    const result = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
    result.addRow(headers)
    result.addRows(rows)
    result.columns.forEach((column, index) => {
      column.width = index === 0 ? 30 : 22
      if (moneyColumns.includes(index + 1)) column.numFmt = numberFormat
    })
    result.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    result.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }
    result.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, result.rowCount), column: headers.length } }
    return result
  }
  const s = data.report.summary
  const summarySheet = sheet(t.summarySheet, [t.summarySheet, data.currency], [
    [t.from, data.report.from], [t.to, data.report.to], [t.scope, data.branchName],
    [t.zone.replace('{{zone}}', data.report.timeZone), ''], [t.currency, data.currency],
    [t.generated, new Date().toISOString()], [t.bills, s.saleCount], [t.voidedBills, s.voidedCount],
    [t.revenue, amount(s.totalSatang)], [t.vat, amount(s.vatSatang)], [t.netSales, amount(s.netSalesSatang)],
    [t.discount, amount(s.discountSatang)], [t.cost, amount(s.costSatang)], [t.profit, amount(s.profitSatang)],
    [t.average, s.saleCount ? amount(Math.round(s.totalSatang / s.saleCount)) : 0],
    [t.basis + '\n' + t.productsNote, ''],
  ], [2])
  summarySheet.getCell('B8').numFmt = '#,##0'
  summarySheet.getCell('B9').numFmt = '#,##0'
  const noteRow = summarySheet.rowCount
  summarySheet.mergeCells(`A${noteRow}:B${noteRow}`)
  summarySheet.getCell(`A${noteRow}`).alignment = { wrapText: true, vertical: 'top' }
  summarySheet.getRow(noteRow).height = 72
  sheet(t.dailySheet, [t.day, t.bills, t.revenue, t.vat, t.netSales, t.cost, t.profit],
    data.report.days.items.map((row) => [row.day, row.saleCount, amount(row.totalSatang), amount(row.vatSatang), amount(row.netSalesSatang), amount(row.costSatang), amount(row.profitSatang)]), [3, 4, 5, 6, 7])
  sheet(t.productsSheet, [t.sku, t.product, t.quantity, t.itemSales],
    data.products.map((row) => [row.sku, row.productName, row.quantity, amount(row.lineTotalSatang)]), [4])
  sheet(t.branchesSheet, [t.branch, t.bills, t.revenue, t.netSales, t.cost, t.profit],
    data.branches.map((row) => [row.branchName, row.saleCount, amount(row.totalSatang), amount(row.netSalesSatang), amount(row.costSatang), amount(row.profitSatang)]), [3, 4, 5, 6])
  sheet(t.methodsSheet, [t.methods, data.currency],
    data.report.byMethod.map((row) => [t[row.method], amount(row.amountSatang)]), [2])
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
