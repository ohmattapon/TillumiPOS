import { inject, injectable } from 'tsyringe'
import { registerRepositoryToken } from '../ports/register.repository'
import type { IRegisterRepository } from '../ports/register.repository'

/** Query. */
@injectable()
export class ListRegistersUseCase {
  constructor(@inject(registerRepositoryToken) private readonly registers: IRegisterRepository) {}
  execute(branchId: number) { return this.registers.findAll(branchId) }
}
