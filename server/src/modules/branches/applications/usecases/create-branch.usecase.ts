import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'

/**
 * Command, refused. The shop runs on one branch (MAIN), created with the database, so no second branch
 * can be added. The route stays in v1 and answers with a conflict rather than disappearing.
 */
@injectable()
export class CreateBranchUseCase {
  async execute(_input: unknown): Promise<never> {
    throw new DomainConflictError('ระบบใช้ได้สาขาเดียว', 'SINGLE_BRANCH_ONLY')
  }
}
