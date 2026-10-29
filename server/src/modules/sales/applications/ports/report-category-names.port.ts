/**
 * Query port for the sales reports: the current names of the given categories.
 * A category that no longer exists is missing from the map. Reports never read the categories module themselves.
 */
export interface IReportCategoryNames {
  namesFor(ids: readonly number[]): Promise<Map<number, string>>
}

const token: unique symbol = Symbol('IReportCategoryNames')
export const reportCategoryNamesToken = token.toString()
