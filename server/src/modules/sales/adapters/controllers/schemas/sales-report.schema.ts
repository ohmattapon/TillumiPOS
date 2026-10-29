import { t, type Static } from 'elysia'
import { page } from '../../../../../libs/http-schemas'

const metrics = t.Object({
  saleCount: t.Integer(), voidedCount: t.Integer(),
  totalSatang: t.Integer(), vatSatang: t.Integer(), discountSatang: t.Integer(),
  costSatang: t.Integer(), netSalesSatang: t.Integer(), profitSatang: t.Integer(),
})
const query = t.Object({
  from: t.String({ format: 'date' }), to: t.String({ format: 'date' }),
  scope: t.Optional(t.Union([t.Literal('branch'), t.Literal('all')])),
})
const overviewQuery = t.Object({ ...query.properties, compare: t.Optional(t.BooleanString()) })
const product = t.Object({
  productId: t.Integer(), productName: t.String(), sku: t.String(),
  quantity: t.Integer(), lineTotalSatang: t.Integer(),
})
const branch = t.Intersect([metrics, t.Object({ branchId: t.Integer(), branchName: t.String() })])
const promotionRow = t.Object({
  promotionId: t.Integer(), name: t.String(), bills: t.Integer(),
  discountSatang: t.Integer(), netSalesSatang: t.Integer(),
})
const overview = t.Object({
  from: t.String(), to: t.String(), timeZone: t.String(),
  scope: t.Union([t.Literal('branch'), t.Literal('all')]),
  summary: metrics,
  previous: t.Optional(metrics),
  days: page(t.Intersect([metrics, t.Object({ day: t.String() })])),
  byMethod: t.Array(t.Object({
    method: t.Union([t.Literal('cash'), t.Literal('promptpay'), t.Literal('card')]),
    amountSatang: t.Integer(),
  })),
})
export const reportSchemas = {
  query, overviewQuery,
  pageQuery: t.Object({ ...query.properties,
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
    offset: t.Optional(t.Numeric({ minimum: 0 })),
  }),
  overview, product, branch, promotion: promotionRow,
}
export type SalesReportResponse = Static<typeof overview>
export type ReportProductResponse = Static<typeof product>
export type ReportBranchResponse = Static<typeof branch>
export type ReportPromotionResponse = Static<typeof promotionRow>
