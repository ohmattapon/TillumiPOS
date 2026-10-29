import { inject, injectable } from 'tsyringe'
import type { IReportBranchNames } from '../../sales/applications/ports/report-branch-names.port'
import { branchRepositoryToken, type IBranchRepository } from '../applications/ports/branch.repository'

/**
 * Answers the sales module's report branch names port from every branch, open or closed.
 * Provider side: the port is owned by sales, implemented and bound here.
 */
@injectable()
export class ReportBranchNamesAdapter implements IReportBranchNames {
  constructor(@inject(branchRepositoryToken) private readonly branches: IBranchRepository) {}

  async namesById(): Promise<Map<number, string>> {
    return new Map((await this.branches.findAll()).map((branch) => [branch.id, branch.name]))
  }
}
