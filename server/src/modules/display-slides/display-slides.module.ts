import { container } from 'tsyringe'
import { DrizzleSlideRepository } from './adapters/repository/slide.drizzle.repository'
import { slideRepositoryToken } from './applications/ports/slide.repository'

container.register(slideRepositoryToken, { useClass: DrizzleSlideRepository })
