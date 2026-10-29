/**
 * Query port for the sales reports: branch names by id, including branches that have since closed.
 * Reports never read the branches module themselves.
 */
export interface IReportBranchNames {
  namesById(): Promise<Map<number, string>>
}

const token: unique symbol = Symbol('IReportBranchNames')
export const reportBranchNamesToken = token.toString()
