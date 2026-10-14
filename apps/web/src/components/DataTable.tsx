import type { ReactNode } from 'react'
import { tableCell, tableHead } from '@/components/Panel'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { splitColumns, type Column } from '@/lib/data-table'
import { cn } from '@/lib/utils'

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  /** Shown when there are no rows and nothing is loading. */
  empty: ReactNode
  isPending?: boolean
  /** The row's own menu (usually a DropdownMenu); shown in the table and in the list. */
  actions?: (row: T) => ReactNode
  onSelect?: (row: T) => void
  /** Accessible name of a list item on a phone. */
  rowLabel?: (row: T) => string
  muted?: (row: T) => boolean
}

/**
 * A table on screens from 640px, a list on phones. Both are rendered and CSS shows one, so nothing
 * measures the screen and nothing flickers while the page loads.
 */
export function DataTable<T>({ columns, rows, rowKey, empty, isPending, actions, onSelect, rowLabel, muted }: Props<T>) {
  const { primary, secondary } = splitColumns(columns)
  const isEmpty = !isPending && rows.length === 0

  return (
    <>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead key={column.id} className={cn(tableHead, column.align === 'right' && 'text-right')}>
                  {column.header}
                </TableHead>
              ))}
              {actions && <TableHead className={cn(tableHead, 'w-0')} />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={rowKey(row)}
                className={cn(muted?.(row) && 'text-muted-foreground', onSelect && 'cursor-pointer')}
                onClick={onSelect && (() => onSelect(row))}
              >
                {columns.map((column) => (
                  <TableCell key={column.id} className={cn(tableCell, column.align === 'right' && 'text-right tabular-nums', column.className)}>
                    {column.cell(row)}
                  </TableCell>
                ))}
                {actions && <TableCell className={cn(tableCell, 'text-right whitespace-nowrap')}>{actions(row)}</TableCell>}
              </TableRow>
            ))}
            {isEmpty && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length + (actions ? 1 : 0)} className="h-24 text-center text-muted-foreground">
                  {empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y sm:hidden">
        {rows.map((row) => {
          const body = (
            <>
              <span className="block truncate font-medium">
                {primary.map((column) => (
                  <span key={column.id} className="mr-2">{column.cell(row)}</span>
                ))}
              </span>
              {secondary.length > 0 && (
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {secondary.map((column) => (
                    <span key={column.id} className={cn(column.align === 'right' && 'tabular-nums')}>{column.cell(row)}</span>
                  ))}
                </span>
              )}
            </>
          )
          return (
            <li key={rowKey(row)} className={cn('flex min-h-14 items-center gap-2 px-4 py-2', muted?.(row) && 'text-muted-foreground')}>
              {onSelect ? (
                <button type="button" className="min-w-0 flex-1 text-left" aria-label={rowLabel?.(row)} onClick={() => onSelect(row)}>
                  {body}
                </button>
              ) : (
                <div className="min-w-0 flex-1">{body}</div>
              )}
              {actions?.(row)}
            </li>
          )
        })}
        {isEmpty && <li className="px-4 py-10 text-center text-sm text-muted-foreground">{empty}</li>}
      </ul>
    </>
  )
}
