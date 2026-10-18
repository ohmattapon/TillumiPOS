import { inject, injectable } from 'tsyringe'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { slideRepositoryToken } from '../ports/slide.repository'
import type { ISlideRepository } from '../ports/slide.repository'

/** Query. */
@injectable()
export class ListSlidesUseCase {
  constructor(@inject(slideRepositoryToken) private readonly slides: ISlideRepository) {}

  async execute(actor: Actor) {
    requirePermission(actor, 'promotions.write', 'เฉพาะเจ้าของร้านจัดการสไลด์ได้')
    return this.slides.findAll()
  }
}
