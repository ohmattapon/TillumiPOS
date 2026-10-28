import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { idempotencyHeaders } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import type { PrintedReceipt } from '../../applications/usecases/print-receipt.usecase'
import { OpenDrawerUseCase } from '../../applications/usecases/open-drawer.usecase'
import { PrintReceiptUseCase } from '../../applications/usecases/print-receipt.usecase'
import { TestPrinterConnectionUseCase } from '../../applications/usecases/test-connection.usecase'
import { receiptPrinterSchemas } from './schemas/receipt-printer.schema'

const toPrintResponse = (printed: PrintedReceipt): typeof receiptPrinterSchemas.printResult.static => printed

@injectable()
export class ReceiptPrinterElysiaController {
  constructor(
    @inject(PrintReceiptUseCase) private readonly print: PrintReceiptUseCase,
    @inject(OpenDrawerUseCase) private readonly openDrawer: OpenDrawerUseCase,
    @inject(TestPrinterConnectionUseCase) private readonly testConnection: TestPrinterConnectionUseCase,
  ) {}

  getRoutes() {
    return (
      new Elysia({ name: 'receipt-printer', prefix: '/receipt-printer', detail: { tags: ['Printing'] } })
        .use(auth)
        .post(
          '/print',
          async ({ body, headers, user, branch }) =>
            toPrintResponse(
              await this.print.execute(
                body,
                { id: user.id, displayName: user.displayName },
                (await branch()).id,
                headers['idempotency-key'],
              ),
            ),
          {
            // Printing is ordinary till work: any signed-in cashier prints, like any sale.
            auth: true,
            headers: idempotencyHeaders,
            body: receiptPrinterSchemas.printBody,
            response: receiptPrinterSchemas.printResult,
            detail: { summary: 'พิมพ์ใบเสร็จที่เรนเดอร์แล้วผ่านเครื่องพิมพ์แลน (คีย์ซ้ำไม่พิมพ์ซ้ำ)' },
          },
        )
        .post(
          '/drawer/open',
          async ({ user, branch }) =>
            this.openDrawer.execute({ id: user.id, displayName: user.displayName }, (await branch()).id),
          {
            auth: true,
            response: receiptPrinterSchemas.drawerResult,
            detail: { summary: 'เปิดลิ้นชักผ่านเครื่องพิมพ์โดยไม่พิมพ์ใบเสร็จ' },
          },
        )
        .post(
          '/test-connection',
          async () => this.testConnection.execute(),
          {
            auth: true,
            response: receiptPrinterSchemas.testResult,
            detail: { summary: 'ทดสอบว่าเครื่องพิมพ์ที่ตั้งไว้ตอบสนองหรือไม่ (ไม่พิมพ์อะไร)' },
          },
        )
    )
  }
}
