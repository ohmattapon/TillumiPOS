import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { auth } from '../../../auth.plugin'
import { ApplyCafeMenuUseCase } from '../../applications/usecases/apply-cafe-menu.usecase'
import { cafeMenuSchemas } from './schemas/cafe-menu.schema'

@injectable()
export class CafeMenuElysiaController {
  constructor(@inject(ApplyCafeMenuUseCase) private readonly applyCafeMenu: ApplyCafeMenuUseCase) {}

  getRoutes() {
    return new Elysia({ name: 'cafeMenu' })
      .use(auth)
      .post('/cafe-menu', async ({ body, user, branch }) => this.applyCafeMenu.execute(body, user, (await branch()).id), {
        // A route carries one permission; the use case checks the other two before it writes.
        auth: { can: 'products.write' },
        body: cafeMenuSchemas.apply,
        response: cafeMenuSchemas.applied,
        detail: { tags: ['Catalog'], summary: 'เพิ่มเมนูคาเฟ่จากชุดที่เลือกไว้ (ของที่มีอยู่แล้วถูกข้าม)' },
      })
  }
}
