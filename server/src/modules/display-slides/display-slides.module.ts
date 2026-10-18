import { container } from 'tsyringe'
import { CryptoSlideIdGenerator } from './adapters/crypto-slide-id-generator'
import { DisplaySlideElysiaController } from './adapters/controllers/display-slides.controller'
import { DrizzleSlideRepository } from './adapters/repository/slide.drizzle.repository'
import { slideIdGeneratorToken } from './applications/ports/slide-id-generator.port'
import { slideRepositoryToken } from './applications/ports/slide.repository'
import { DeleteSlideUseCase } from './applications/usecases/delete-slide.usecase'
import { ListActiveSlidesUseCase } from './applications/usecases/list-active-slides.usecase'
import { ListSlidesUseCase } from './applications/usecases/list-slides.usecase'
import { UpdateSlideUseCase } from './applications/usecases/update-slide.usecase'
import { UploadSlideImageUseCase } from './applications/usecases/upload-slide-image.usecase'

container.register(slideRepositoryToken, { useClass: DrizzleSlideRepository })
container.register(slideIdGeneratorToken, { useClass: CryptoSlideIdGenerator })
container.registerSingleton(ListActiveSlidesUseCase)
container.registerSingleton(ListSlidesUseCase)
container.registerSingleton(UploadSlideImageUseCase)
container.registerSingleton(UpdateSlideUseCase)
container.registerSingleton(DeleteSlideUseCase)
container.registerSingleton(DisplaySlideElysiaController)
