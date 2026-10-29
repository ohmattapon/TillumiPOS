/**
 * Query port for the sales reports: the IANA time zone that decides which calendar day a sale belongs to.
 * Reports never read the shop settings themselves.
 */
export interface IReportTimeZone {
  timeZone(): Promise<string>
}

const token: unique symbol = Symbol('IReportTimeZone')
export const reportTimeZoneToken = token.toString()
