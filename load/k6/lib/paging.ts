// Walking a paged report to the end the way the Excel export does, but with a cap so a runaway total cannot hold a
// virtual user forever. Pure: the caller does the request and reports how many rows came back.

export interface PageRead {
  /** Rows on this page. */
  rows: number
  /** Rows the whole report has. */
  total: number
}

export interface WalkResult {
  rows: number
  /** Pages asked for, including one that failed. */
  pages: number
  /** True when every row up to `total` was read. */
  complete: boolean
}

/** `fetchPage` returns null when the request failed. The walk stops at the total, at a page with no rows, or at `maxPages`. */
export function walkPages(fetchPage: (offset: number, limit: number) => PageRead | null, options: { limit: number; maxPages: number }): WalkResult {
  let rows = 0
  let pages = 0
  while (pages < options.maxPages) {
    const page = fetchPage(rows, options.limit)
    pages++
    if (page === null) return { rows, pages, complete: false }
    rows += page.rows
    if (rows >= page.total) return { rows, pages, complete: true }
    // A page with no rows before the total would repeat forever.
    if (page.rows === 0) return { rows, pages, complete: false }
  }
  return { rows, pages, complete: false }
}
