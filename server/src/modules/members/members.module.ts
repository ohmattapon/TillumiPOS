import { container } from 'tsyringe'
import { MemberElysiaController } from './adapters/controllers/member.controller'
import { DrizzleMemberRepository } from './adapters/repository/member.drizzle.repository'
import { memberRepositoryToken } from './applications/ports/member.repository'
import { CreateMemberUseCase } from './applications/usecases/create-member.usecase'
import { UpdateMemberUseCase } from './applications/usecases/update-member.usecase'
import { GetMemberUseCase } from './applications/usecases/get-member.usecase'
import { ListMembersUseCase } from './applications/usecases/list-members.usecase'
import { GetMemberSalesHistoryUseCase } from './applications/usecases/get-member-sales-history.usecase'

container.register(memberRepositoryToken, { useClass: DrizzleMemberRepository })
container.registerSingleton(CreateMemberUseCase)
container.registerSingleton(UpdateMemberUseCase)
container.registerSingleton(GetMemberUseCase)
container.registerSingleton(ListMembersUseCase)
container.registerSingleton(GetMemberSalesHistoryUseCase)
container.registerSingleton(MemberElysiaController)
