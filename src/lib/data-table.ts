import type { ReactNode } from 'react'

/** primary: heads the list item on a phone. secondary: its second line. wide-only: only in the table. */
export type ColumnPriority = 'primary' | 'secondary' | 'wide-only'

export interface Column<T> {
  id: string
  header: string
  cell: (row: T) => ReactNode
  priority: ColumnPriority
  align?: 'right'
  className?: string
}

/** Which columns a phone shows, and where. */
export function splitColumns<T>(columns: Column<T>[]) {
  const shown = columns.filter((column) => column.priority !== 'wide-only')
  const primary = shown.filter((column) => column.priority === 'primary')
  if (primary.length > 0) return { primary, secondary: shown.filter((column) => column.priority === 'secondary') }
  return { primary: shown.slice(0, 1), secondary: shown.slice(1) }
}
