import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { shopSettingsRepositoryToken, type IShopSettingsRepository } from '../../../settings/applications/ports/shop-settings.repository'
import { memberRepositoryToken, type IMemberRepository } from '../ports/member.repository'
import { memberSalesHistoryToken, type IMemberSalesHistory } from '../ports/member-sales-history.port'
import { memberHistorySchema, memberIdSchema } from '../schemas/member-schemas'

/** Query: only sales in the authorized active branch. */
@injectable()
export class GetMemberSalesHistoryUseCase {
  constructor(
    @inject(memberRepositoryToken) private readonly members: IMemberRepository,
    @inject(memberSalesHistoryToken) private readonly history: IMemberSalesHistory,
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
  ) {}
  async execute(id: number, input: unknown, branchId: number) {
    const dto = memberHistorySchema.parse(input)
    memberIdSchema.parse({ id })
    if (!await this.members.findById(id)) throw new DomainNotFoundError('ไม่พบสมาชิก', 'MEMBER_NOT_FOUND')
    const { timeZone } = await this.settings.get()
    return this.history.find({ ...dto, memberId: id, branchId, timeZone })
  }
}
