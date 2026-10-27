import { container } from 'tsyringe'
import { quoteMembersToken } from '../quotes/applications/ports/quote-members.port'
import { checkoutMembersToken } from '../sales/applications/ports/checkout-members.port'
import { checkoutPointsToken } from '../sales/applications/ports/checkout-points.port'
import { quotePointsToken } from '../quotes/applications/ports/quote-points.port'
import { MemberElysiaController } from './adapters/controllers/member.controller'
import { CheckoutMembersAdapter } from './adapters/repository/checkout-members.adapter'
import { DrizzleMemberPointsLedger } from './adapters/repository/member-points.drizzle.repository'
import { DrizzleMemberRepository } from './adapters/repository/member.drizzle.repository'
import { memberRepositoryToken } from './applications/ports/member.repository'
import { CreateMemberUseCase } from './applications/usecases/create-member.usecase'
import { UpdateMemberUseCase } from './applications/usecases/update-member.usecase'
import { GetMemberUseCase } from './applications/usecases/get-member.usecase'
import { ListMembersUseCase } from './applications/usecases/list-members.usecase'
import { GetMemberSalesHistoryUseCase } from './applications/usecases/get-member-sales-history.usecase'

container.register(memberRepositoryToken, { useClass: DrizzleMemberRepository })
container.register(quoteMembersToken, { useToken: memberRepositoryToken })
container.register(checkoutMembersToken, { useClass: CheckoutMembersAdapter })
container.register(checkoutPointsToken, { useClass: DrizzleMemberPointsLedger })
container.register(quotePointsToken, { useClass: DrizzleMemberPointsLedger })
container.registerSingleton(CreateMemberUseCase)
container.registerSingleton(UpdateMemberUseCase)
container.registerSingleton(GetMemberUseCase)
container.registerSingleton(ListMembersUseCase)
container.registerSingleton(GetMemberSalesHistoryUseCase)
container.registerSingleton(MemberElysiaController)
