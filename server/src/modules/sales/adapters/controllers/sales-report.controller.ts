import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { GetSalesReportUseCase } from '../../applications/usecases/get-sales-report.usecase'
import { GetPromotionReportUseCase } from '../../applications/usecases/get-promotion-report.usecase'
import { ListReportProductsUseCase } from '../../applications/usecases/list-report-products.usecase'
import { ListReportBranchesUseCase } from '../../applications/usecases/list-report-branches.usecase'
import { ListReportCashiersUseCase } from '../../applications/usecases/list-report-cashiers.usecase'
import { reportSchemas } from './schemas/sales-report.schema'

@injectable()
export class SalesReportElysiaController {
  constructor(
    @inject(GetSalesReportUseCase) private readonly overview: GetSalesReportUseCase,
    @inject(ListReportProductsUseCase) private readonly products: ListReportProductsUseCase,
    @inject(ListReportBranchesUseCase) private readonly branches: ListReportBranchesUseCase,
    @inject(GetPromotionReportUseCase) private readonly promotions: GetPromotionReportUseCase,
    @inject(ListReportCashiersUseCase) private readonly cashiers: ListReportCashiersUseCase,
  ) {}
  getRoutes() {
    return new Elysia({ name: 'sales-reports', prefix: '/sales/reports', detail: { tags: ['Sales'] } })
      .use(auth)
      .get('/', async ({ query, user, branch }) => this.overview.execute(query, user, (await branch()).id), {
        auth: { can: 'reports.read' }, query: reportSchemas.overviewQuery, response: reportSchemas.overview,
        detail: { summary: 'ยอดขายย้อนหลังตามวันและเขตเวลาของร้าน (สูงสุด 366 วัน)' },
      })
      .get('/products', async ({ query, user, branch }) => this.products.execute(query, user, (await branch()).id), {
        auth: { can: 'reports.read' }, query: reportSchemas.pageQuery, response: page(reportSchemas.product),
        detail: { summary: 'สินค้าขายดี เรียงตามจำนวน ใช้ข้อมูล ณ ตอนขาย' },
      })
      .get('/branches', async ({ query, user, branch }) => this.branches.execute(query, user, (await branch()).id), {
        auth: { can: 'reports.read' }, query: reportSchemas.pageQuery, response: page(reportSchemas.branch),
        detail: { summary: 'เปรียบเทียบยอดขายแยกสาขา' },
      })
      .get('/promotions', async ({ query, user, branch }) => this.promotions.execute(query, user, (await branch()).id), {
        auth: { can: 'reports.read' }, query: reportSchemas.pageQuery, response: page(reportSchemas.promotion),
        detail: { summary: 'ยอดขายและส่วนลดแยกตามโปรโมชัน ใช้ข้อมูล ณ ตอนขาย' },
      })
      .get('/cashiers', async ({ query, user, branch }) => this.cashiers.execute(query, user, (await branch()).id), {
        auth: { can: 'reports.read' }, query: reportSchemas.rangeQuery, response: page(reportSchemas.cashier),
        detail: { summary: 'แคชเชียร์ที่ขายในช่วงวัน พร้อมจำนวนบิล ใช้เลือกกรองรายงาน' },
      })
  }
}
