import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Header cell style shared by every data table: small muted caps, no column dividers. */
export const tableHead = 'h-11 px-4 text-[11px] font-medium tracking-wider text-muted-foreground uppercase'

/** A roomy cell: with one line of text a row is about 52px tall. */
export const tableCell = 'px-4 py-4'

/** The row above a table inside its card: the page's search sits here. */
export const tableToolbar = 'flex flex-wrap items-center gap-3 border-b px-4 py-3'

interface Props {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

/** Bordered card with a title row, used for tables and lists. */
export function Panel({ title, description, action, children, className }: Props) {
  return (
    <section className={cn('flex min-h-0 flex-col overflow-hidden rounded-[10px] border bg-card', className)}>
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div>
      </div>
      {children}
    </section>
  )
}
