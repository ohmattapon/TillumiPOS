import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { roleRepositoryToken, type IRoleRepository } from '../ports/role.repository'
import { roleUsageToken, type IRoleUsage } from '../ports/role-usage.port'
import { roleIdSchema } from '../schemas/role-schemas'
/** Command. */
@injectable()
export class DeleteRoleUseCase {
  constructor(@inject(roleRepositoryToken) private readonly roles: IRoleRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(roleUsageToken) private readonly usage: IRoleUsage) {}
  async execute(input: unknown) {
    const id = roleIdSchema.parse(input)
    return this.unitOfWork.run(async () => {
      const role = await this.roles.findByIdForUpdate(id)
      if (!role) throw new DomainNotFoundError('ไม่พบบทบาท', 'ROLE_NOT_FOUND')
      if (role.isSystem) throw new DomainConflictError('บทบาทของระบบลบไม่ได้', 'ROLE_PROTECTED')
      if (await this.usage.countUsers(id)) throw new DomainConflictError('มีผู้ใช้ถือบทบาทนี้อยู่', 'ROLE_IN_USE')
      await this.roles.delete(id)
      return role
    })
  }
}
