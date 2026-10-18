import { inject, injectable } from 'tsyringe'
import { slideRepositoryToken } from '../ports/slide.repository'
import type { ISlideRepository } from '../ports/slide.repository'

/** Query. */
@injectable()
export class ListActiveSlidesUseCase {
  constructor(@inject(slideRepositoryToken) private readonly slides: ISlideRepository) {}

  execute() {
    return this.slides.findActive()
  }
}
