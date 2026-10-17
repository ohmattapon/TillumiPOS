import { container } from 'tsyringe'
import { DisplaySlideElysiaController } from './adapters/controllers/display-slides.controller'
import { DrizzleSlideRepository } from './adapters/repository/slide.drizzle.repository'
import { slideRepositoryToken } from './applications/ports/slide.repository'
import { DeleteSlideUseCase } from './applications/usecases/delete-slide.usecase'
import { ListActiveSlidesUseCase } from './applications/usecases/list-active-slides.usecase'
import { ListSlidesUseCase } from './applications/usecases/list-slides.usecase'
import { UpdateSlideUseCase } from './applications/usecases/update-slide.usecase'
import { UploadSlideImageUseCase } from './applications/usecases/upload-slide-image.usecase'

container.register(slideRepositoryToken, { useClass: DrizzleSlideRepository })
container.registerSingleton(ListActiveSlidesUseCase)
container.registerSingleton(ListSlidesUseCase)
container.registerSingleton(UploadSlideImageUseCase)
container.registerSingleton(UpdateSlideUseCase)
container.registerSingleton(DeleteSlideUseCase)
container.registerSingleton(DisplaySlideElysiaController)
