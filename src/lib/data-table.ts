import type { ReactNode } from 'react'
import type { ColumnDef, RowData } from '@tanstack/react-table'

/** primary: heads the list item on a phone. secondary: its second line. wide-only: only in the table. */
export type ColumnPriority = 'primary' | 'secondary' | 'wide-only'

export interface Column<T> {
  id: string
  header: string
  cell: (row: T) => ReactNode
  priority: ColumnPriority
  align?: 'right'
  className?: string
  /** A width class for the column (set on its header, which is drawn even when there are no rows), so stacked tables line up. */
  width?: string
}

declare module '@tanstack/react-table' {
  // The renderer reads align, priority and className back from the column a page wrote.
  interface ColumnMeta<TData extends RowData, TValue> {
    column: Column<TData>
  }
}

/** Which columns a phone shows, and where. */
export function splitColumns<T>(columns: Column<T>[]) {
  const shown = columns.filter((column) => column.priority !== 'wide-only')
  const primary = shown.filter((column) => column.priority === 'primary')
  if (primary.length > 0) return { primary, secondary: shown.filter((column) => column.priority === 'secondary') }
  return { primary: shown.slice(0, 1), secondary: shown.slice(1) }
}

/** The columns a page writes, as TanStack column definitions. */
export function toColumnDefs<T>(columns: Column<T>[]): ColumnDef<T>[] {
  return columns.map((column) => ({
    id: column.id,
    header: column.header,
    cell: ({ row }) => column.cell(row.original),
    meta: { column },
  }))
}
