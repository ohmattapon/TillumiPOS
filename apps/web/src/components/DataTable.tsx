import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { tableCell, tableHead } from '@/components/Panel'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { splitColumns, type Column } from '@/lib/data-table'
import { barWidth } from '@/lib/skeleton'
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
// Wide-only columns need the room of a laptop; tablets get the columns that matter for the job.
const wideOnly = <T,>(column: Column<T>) => column.priority === 'wide-only' && 'hidden lg:table-cell'

// How many placeholder rows stand in while the first answer is on its way.
const PLACEHOLDER_ROWS = 5
const PHONE_PLACEHOLDER_ROWS = 4

export function DataTable<T>({ columns, rows, rowKey, empty, isPending, actions, onSelect, rowLabel, muted }: Props<T>) {
  const { primary, secondary } = splitColumns(columns)
  const { t } = useTranslation()
  const isEmpty = !isPending && rows.length === 0

  return (
    <>
      {isPending && <p role="status" aria-busy="true" className="sr-only">{t('loading')}</p>}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead key={column.id} className={cn(tableHead, column.align === 'right' && 'text-right', wideOnly(column))}>
                  {column.header}
                </TableHead>
              ))}
              {actions && <TableHead className={cn(tableHead, 'w-0')} />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: PLACEHOLDER_ROWS }, (_, row) => (
                <TableRow key={row} className="hover:bg-transparent" aria-hidden>
                  {columns.map((column, index) => (
                    <TableCell key={column.id} className={cn(tableCell, wideOnly(column))}>
                      <Skeleton className={cn('h-4', barWidth(row + index), column.align === 'right' && 'ml-auto')} />
                    </TableCell>
                  ))}
                  {actions && (
                    <TableCell className={cn(tableCell, 'text-right')}>
                      <Skeleton className="ml-auto size-9 rounded-md" />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            {rows.map((row) => (
              <TableRow
                key={rowKey(row)}
                className={cn(muted?.(row) && 'text-muted-foreground', onSelect && 'cursor-pointer')}
                // A row that opens something is reachable from the keyboard as well as by the mouse.
                tabIndex={onSelect ? 0 : undefined}
                onClick={onSelect && (() => onSelect(row))}
                onKeyDown={onSelect && ((event) => event.key === 'Enter' && onSelect(row))}
              >
                {columns.map((column) => (
                  <TableCell key={column.id} className={cn(tableCell, column.align === 'right' && 'text-right tabular-nums', column.className, wideOnly(column))}>
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
        {isPending &&
          Array.from({ length: PHONE_PLACEHOLDER_ROWS }, (_, row) => (
            <li key={row} className="flex min-h-14 items-center px-4 py-3" aria-hidden>
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className={cn('h-4', barWidth(row))} />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </li>
          ))}
        {rows.map((row) => {
          const body = (
            <>
              <div className="min-w-0 font-medium">
                {primary.map((column) => (
                  <div key={column.id} className="truncate">{column.cell(row)}</div>
                ))}
              </div>
              {secondary.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {secondary.map((column) => (
                    <span key={column.id} className={cn(column.align === 'right' && 'tabular-nums')}>{column.cell(row)}</span>
                  ))}
                </div>
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
