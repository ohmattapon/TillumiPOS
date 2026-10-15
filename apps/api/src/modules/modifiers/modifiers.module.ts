import { container } from 'tsyringe'
import { ModifierElysiaController } from './adapters/controllers/modifier.controller'
import { CachedModifierRepository } from './adapters/repository/modifier.cached.repository'
import { lineOptionsResolverToken } from './applications/ports/line-options-resolver.port'
import { modifierRepositoryToken } from './applications/ports/modifier.repository'
import { LineOptionsResolver } from './applications/services/line-options-resolver'
import { CreateModifierGroupUseCase } from './applications/usecases/create-modifier-group.usecase'
import { CreateModifierOptionUseCase } from './applications/usecases/create-modifier-option.usecase'
import { ListModifierGroupsUseCase } from './applications/usecases/list-modifier-groups.usecase'
import { SetProductModifierGroupsUseCase } from './applications/usecases/set-product-modifier-groups.usecase'
import { UpdateModifierGroupUseCase } from './applications/usecases/update-modifier-group.usecase'
import { UpdateModifierOptionUseCase } from './applications/usecases/update-modifier-option.usecase'

container.register(modifierRepositoryToken, { useClass: CachedModifierRepository })
container.register(lineOptionsResolverToken, { useClass: LineOptionsResolver })
container.registerSingleton(ListModifierGroupsUseCase)
container.registerSingleton(CreateModifierGroupUseCase)
container.registerSingleton(UpdateModifierGroupUseCase)
container.registerSingleton(CreateModifierOptionUseCase)
container.registerSingleton(UpdateModifierOptionUseCase)
container.registerSingleton(SetProductModifierGroupsUseCase)
container.registerSingleton(ModifierElysiaController)
