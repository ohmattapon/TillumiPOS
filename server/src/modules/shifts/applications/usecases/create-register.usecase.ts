import { inject, injectable } from 'tsyringe'
import { RegisterEntity } from '../../../../domains/register.domain'
import { registerRepositoryToken } from '../ports/register.repository'
import type { IRegisterRepository } from '../ports/register.repository'
import { createRegisterSchema } from '../schemas/shift-schemas'

/** Command. */
@injectable()
export class CreateRegisterUseCase {
  constructor(@inject(registerRepositoryToken) private readonly registers: IRegisterRepository) {}

  async execute(input: unknown, branchId: number) {
    const dto = createRegisterSchema.parse(input)
    return this.registers.create(new RegisterEntity({ id: 0, branchId, code: dto.code, name: dto.name, isActive: true }))
  }
}
