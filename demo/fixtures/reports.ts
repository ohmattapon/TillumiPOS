import type { ModifierGroup, Product, Sale } from '@pos/api/types'
import type {
  ReportBranchResponse,
  ReportProductResponse,
  SalesReportResponse,
} from '../../server/src/modules/sales/adapters/controllers/schemas/sales-report.schema'

export interface ReportDeps {
  products: Product[]
  groups: ModifierGroup[]
}

interface Sums {
  saleCount: number
  voidedCount: number
  totalSatang: number
  vatSatang: number
  discountSatang: number
  costSatang: number
}

// Bangkok has no daylight saving, so a fixed +7 shift turns an instant into its shop calendar date.
function shopDay(at: Date): string {
  return new Date(at.getTime() + 7 * 3_600_000).toISOString().slice(0, 10)
}

function costOf(deps: ReportDeps, sale: Sale): number {
  const productById = new Map(deps.products.map((item) => [item.id, item]))
  const optionCost = new Map(deps.groups.flatMap((group) => group.options.map((option) => [option.id, option.costSatang])))
  return sale.items.reduce((sum, item) => {
    const product = productById.get(item.productId)
    const options = item.options.reduce((acc, option) => acc + (optionCost.get(option.optionId) ?? 0), 0)
    return sum + ((product?.costSatang ?? 0) + options) * item.quantity
  }, 0)
}

function emptySums(): Sums {
  return { saleCount: 0, voidedCount: 0, totalSatang: 0, vatSatang: 0, discountSatang: 0, costSatang: 0 }
}

function addSale(sums: Sums, deps: ReportDeps, sale: Sale): void {
  if (sale.status === 'voided') {
    sums.voidedCount += 1
    return
  }
  sums.saleCount += 1
  sums.totalSatang += sale.totalSatang
  sums.vatSatang += sale.vatSatang
  sums.discountSatang += sale.discountSatang
  sums.costSatang += costOf(deps, sale)
}

function metrics(sums: Sums): Omit<Sums, never> & { netSalesSatang: number; profitSatang: number } {
  const netSalesSatang = sums.totalSatang - sums.vatSatang
  return { ...sums, netSalesSatang, profitSatang: netSalesSatang - sums.costSatang }
}

/** Stable overview from the same bills the Today page lists, bucketed by shop date. */
export function buildReportOverview(
  deps: ReportDeps,
  sales: Sale[],
  input: { from: string; to: string; timeZone: string; scope: 'branch' | 'all' },
): SalesReportResponse {
  const inRange = sales.filter((sale) => {
    const day = shopDay(sale.createdAt)
    return day >= input.from && day <= input.to
  })
  const summary = emptySums()
  const byDay = new Map<string, Sums>()
  for (const sale of inRange) {
    addSale(summary, deps, sale)
    const day = shopDay(sale.createdAt)
    const row = byDay.get(day) ?? emptySums()
    addSale(row, deps, sale)
    byDay.set(day, row)
  }
  // Every day in the range shows, even a quiet one, so the chart never has holes.
  const days: string[] = []
  for (let day = input.from; day <= input.to && days.length < 370; day = shopDay(new Date(`${day}T17:00:00Z`))) days.push(day)
  const tendered = new Map<'cash' | 'promptpay' | 'card', number>()
  for (const sale of inRange.filter((item) => item.status === 'completed')) {
    const cash = sale.payments.filter((p) => p.method === 'cash').reduce((sum, p) => sum + p.amountSatang, 0) - sale.changeSatang
    tendered.set('cash', (tendered.get('cash') ?? 0) + cash)
    for (const method of ['promptpay', 'card'] as const)
      tendered.set(method, (tendered.get(method) ?? 0) + sale.payments.filter((p) => p.method === method).reduce((sum, p) => sum + p.amountSatang, 0))
  }
  return {
    from: input.from,
    to: input.to,
    timeZone: input.timeZone,
    scope: input.scope,
    summary: metrics(summary),
    days: {
      items: days.map((day) => ({ day, ...metrics(byDay.get(day) ?? emptySums()) })),
      total: days.length,
    },
    byMethod: (['cash', 'promptpay', 'card'] as const).map((method) => ({ method, amountSatang: tendered.get(method) ?? 0 })),
  }
}

/** Best sellers in the range, most pieces first. */
export function buildReportProducts(sales: Sale[], input: { from: string; to: string }): ReportProductResponse[] {
  const rows = new Map<number, ReportProductResponse>()
  for (const sale of sales.filter((item) => item.status === 'completed')) {
    const day = shopDay(sale.createdAt)
    if (day < input.from || day > input.to) continue
    for (const item of sale.items) {
      const row = rows.get(item.productId) ?? { productId: item.productId, productName: item.productName, sku: item.sku, quantity: 0, lineTotalSatang: 0 }
      row.quantity += item.quantity
      row.lineTotalSatang += item.lineTotalSatang
      rows.set(item.productId, row)
    }
  }
  return [...rows.values()].sort((a, b) => b.quantity - a.quantity || b.lineTotalSatang - a.lineTotalSatang)
}

/** One row: the shop runs on a single branch. */
export function buildReportBranches(
  deps: ReportDeps,
  sales: Sale[],
  input: { from: string; to: string; branchId: number; branchName: string },
): ReportBranchResponse[] {
  const sums = emptySums()
  for (const sale of sales) {
    const day = shopDay(sale.createdAt)
    if (day < input.from || day > input.to) continue
    addSale(sums, deps, sale)
  }
  return [{ branchId: input.branchId, branchName: input.branchName, ...metrics(sums) }]
}
