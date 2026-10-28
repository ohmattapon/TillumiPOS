import { inject, injectable } from 'tsyringe'
import { RegisterEntity } from '../../../../domains/register.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { TOKENS } from '../../../tokens'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { registerRepositoryToken } from '../ports/register.repository'
import type { IRegisterRepository } from '../ports/register.repository'
import { updateRegisterSchema } from '../schemas/shift-schemas'

/** Command. */
@injectable()
export class UpdateRegisterUseCase {
  constructor(
    @inject(registerRepositoryToken) private readonly registers: IRegisterRepository,
    @inject(TOKENS.UnitOfWork) private readonly uow: IUnitOfWork,
  ) {}

  async execute(id: number, input: unknown, branchId: number) {
    const dto = updateRegisterSchema.parse(input)
    return this.uow.run(async () => {
      const current = await this.registers.findByIdForUpdate(id, branchId)
      if (!current) throw new DomainNotFoundError('ไม่พบจุดขาย', 'REGISTER_NOT_FOUND')
      if (dto.isActive === false && current.isActive && (await this.registers.hasOpenShift(id)))
        throw new DomainConflictError('ปิดใช้งานจุดขายที่มีกะยังไม่ปิดไม่ได้', 'REGISTER_IN_USE')
      const renamed = dto.name === undefined ? current : current.rename(dto.name)
      return this.registers.update(dto.isActive === false ? renamed.deactivate() : dto.isActive === true ? new RegisterEntity({ ...renamed.toSnapshot(), isActive: true }) : renamed)
    })
  }
}
