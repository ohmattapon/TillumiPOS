import { t, type Static } from 'elysia'
import { page } from '../../../../../libs/http-schemas'

const metrics = t.Object({
  saleCount: t.Integer(), voidedCount: t.Integer(),
  totalSatang: t.Integer(), vatSatang: t.Integer(), discountSatang: t.Integer(),
  costSatang: t.Integer(), netSalesSatang: t.Integer(), profitSatang: t.Integer(),
})
const rangeQuery = t.Object({
  from: t.String({ format: 'date' }), to: t.String({ format: 'date' }),
  scope: t.Optional(t.Union([t.Literal('branch'), t.Literal('all')])),
})
const query = t.Object({
  ...rangeQuery.properties,
  cashierId: t.Optional(t.Numeric()),
  customer: t.Optional(t.Union([t.Literal('member'), t.Literal('guest')])),
})
const overviewQuery = t.Object({ ...query.properties, compare: t.Optional(t.BooleanString()) })
const product = t.Object({
  productId: t.Integer(), productName: t.String(), sku: t.String(),
  quantity: t.Integer(), lineTotalSatang: t.Integer(),
})
const item = t.Object({
  productId: t.Integer(), productName: t.String(), sku: t.String(), packSize: t.Integer(),
  quantity: t.Integer(), pieces: t.Integer(), netSalesSatang: t.Integer(), vatSatang: t.Integer(),
  costSatang: t.Integer(), profitSatang: t.Integer(),
})
const categoryRow = t.Object({
  categoryId: t.Nullable(t.Integer()), name: t.Nullable(t.String()),
  quantity: t.Integer(), netSalesSatang: t.Integer(), vatSatang: t.Integer(),
  costSatang: t.Integer(), profitSatang: t.Integer(), shareBp: t.Integer(),
})
const branch = t.Intersect([metrics, t.Object({ branchId: t.Integer(), branchName: t.String() })])
const promotionRow = t.Object({
  promotionId: t.Integer(), name: t.String(), bills: t.Integer(),
  discountSatang: t.Integer(), netSalesSatang: t.Integer(),
})
const promotionPage = t.Object({
  items: t.Array(promotionRow), total: t.Integer(),
  totals: t.Object({ bills: t.Integer(), discountSatang: t.Integer(), netSalesSatang: t.Integer() }),
  completedBills: t.Integer(),
})
const cashier = t.Object({ cashierId: t.Integer(), cashierName: t.String(), bills: t.Integer() })
const overview = t.Object({
  from: t.String(), to: t.String(), timeZone: t.String(),
  scope: t.Union([t.Literal('branch'), t.Literal('all')]),
  summary: metrics,
  unallocatedLines: t.Integer(),
  previous: t.Optional(metrics),
  days: page(t.Intersect([metrics, t.Object({ day: t.String() })])),
  byMethod: t.Array(t.Object({
    method: t.Union([t.Literal('cash'), t.Literal('promptpay'), t.Literal('card')]),
    amountSatang: t.Integer(),
  })),
})
export const reportSchemas = {
  query, rangeQuery, overviewQuery,
  pageQuery: t.Object({ ...query.properties,
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
    offset: t.Optional(t.Numeric({ minimum: 0 })),
  }),
  // categoryId is a category id or the word `none`; the use case parses it.
  itemsQuery: t.Object({
    from: t.String({ format: 'date' }), to: t.String({ format: 'date' }),
    scope: t.Optional(t.Union([t.Literal('branch'), t.Literal('all')])),
    cashierId: t.Optional(t.Numeric()),
    customer: t.Optional(t.Union([t.Literal('member'), t.Literal('guest')])),
    categoryId: t.Optional(t.String({ pattern: '^(none|[1-9][0-9]*)$' })),
    sort: t.Optional(t.Union([t.Literal('quantity'), t.Literal('sales'), t.Literal('profit'), t.Literal('margin')])),
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
    offset: t.Optional(t.Numeric({ minimum: 0 })),
  }),
  overview, product, item, category: categoryRow, branch, promotion: promotionRow, promotionPage, cashier,
}
export type SalesReportResponse = Static<typeof overview>
export type ReportProductResponse = Static<typeof product>
export type ReportItemResponse = Static<typeof item>
export type ReportCategoryResponse = Static<typeof categoryRow>
export type ReportBranchResponse = Static<typeof branch>
export type ReportPromotionResponse = Static<typeof promotionRow>
