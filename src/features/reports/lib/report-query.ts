import type { ReportFilters } from './date-range'

/** The query every report route shares. `compare` is left out: only the overview reads it. */
export function reportQueryParams({ from, to, cashierId, customer }: ReportFilters) {
  return {
    from, to,
    ...(cashierId !== undefined && { cashierId }),
    ...(customer !== undefined && { customer }),
  }
}
