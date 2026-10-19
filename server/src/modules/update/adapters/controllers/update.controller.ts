import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { auth } from '../../../auth.plugin'
import { ApplyUpdateUseCase } from '../../applications/usecases/apply-update.usecase'
import { CheckUpdateUseCase } from '../../applications/usecases/check-update.usecase'
import { updateSchemas } from './schemas/update.schema'

/**
 * Shop updates. Checking is open to every signed-in user; staging a release
 * needs settings.write (the whole settings page is owner-only already).
 * Neither route takes a URL: the feed location is fixed server-side.
 */
@injectable()
export class UpdateElysiaController {
  constructor(
    @inject(CheckUpdateUseCase) private readonly check: CheckUpdateUseCase,
    @inject(ApplyUpdateUseCase) private readonly apply: ApplyUpdateUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'update', prefix: '/update', detail: { tags: ['Update'] } })
      .use(auth)
      .get('/status', async () => this.check.execute(), {
        auth: true,
        response: updateSchemas.status,
        detail: { summary: 'รุ่นที่ใช้อยู่เทียบกับรุ่นล่าสุด' },
      })
      .post('/apply', async ({ user }) => this.apply.execute(undefined, user), {
        auth: { can: 'settings.write' },
        response: updateSchemas.staged,
        detail: { summary: 'โหลดรุ่นใหม่มาตรวจและเตรียมไว้ให้สคริปต์ติดตั้ง (เจ้าของร้าน)' },
      })
  }
}
