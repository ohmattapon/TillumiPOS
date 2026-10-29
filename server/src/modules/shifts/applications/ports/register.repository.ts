import type { RegisterEntity } from '../../../../domains/register.domain'

export interface IRegisterRepository {
  findAll(branchId: number): Promise<RegisterEntity[]>
  findById(id: number, branchId: number): Promise<RegisterEntity | null>
  findByIdForUpdate(id: number, branchId: number): Promise<RegisterEntity | null>
  create(entity: RegisterEntity): Promise<RegisterEntity>
  update(entity: RegisterEntity): Promise<RegisterEntity>
  hasOpenShift(registerId: number): Promise<boolean>
}

const token: unique symbol = Symbol('IRegisterRepository')
export const registerRepositoryToken = token.toString()
