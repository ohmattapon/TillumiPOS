import { inject, injectable } from 'tsyringe'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { memberPointsToken, type IMemberPoints } from '../ports/member-points.port'
import { memberRepositoryToken, type IMemberRepository } from '../ports/member.repository'
import { adjustMemberPointsSchema } from '../schemas/member-schemas'

/** Command: adjusts a member's points by hand, with a reason. */
@injectable()
export class AdjustMemberPointsUseCase {
  constructor(
    @inject(memberRepositoryToken) private readonly members: IMemberRepository,
    @inject(memberPointsToken) private readonly points: IMemberPoints,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) {}

  async execute(
    id: number,
    input: unknown,
    actor: Actor & { id: number; displayName: string },
    branchId: number,
  ) {
    const dto = adjustMemberPointsSchema.parse(input)
    requirePermission(actor, 'members.points_adjust')

    return this.unitOfWork.run(async () => {
      // Locked so two adjustments cannot read and then write the same balance.
      const member = await this.members.findByIdForUpdate(id)
      if (!member) throw new DomainNotFoundError('ไม่พบสมาชิก', 'MEMBER_NOT_FOUND')

      await this.points.lockMember(id)
      // The ledger refuses a movement that would take the balance below zero.
      const { balanceAfter } = await this.points.record({
        memberId: id,
        kind: 'adjust',
        points: dto.points,
        saleId: null,
        quoteId: null,
        reason: dto.reason,
        actorId: actor.id,
      })

      await this.audit.record({ id: actor.id, name: actor.displayName }, branchId, buildAuditEntry({
        action: 'member.points_adjusted',
        entityType: 'member',
        entityId: String(id),
        summary: 'ปรับแต้มสมาชิก',
        before: { pointsBalance: member.pointsBalance },
        after: { pointsBalance: balanceAfter },
        reason: dto.reason,
      }))

      return { memberId: id, pointsBalance: balanceAfter }
    })
  }
}
