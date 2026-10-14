import type { DiningTable } from '@pos/api/types'
import { LAYOUT_HEIGHT, LAYOUT_WIDTH } from '@pos/api/dining-table'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface Props {
  tables: readonly DiningTable[]
  selectedId?: number | null
  onSelect?: (table: DiningTable) => void
  /** What is shown inside a table under its name; defaults to the open orders. */
  renderBadge?: (table: DiningTable) => ReactNode
}

/** The floor of a branch: each table where the owner put it, with whether anyone is sitting at it. */
export function FloorPlan({ tables, selectedId = null, onSelect, renderBadge }: Props) {
  const { t } = useTranslation('tables')

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border bg-muted/40"
      style={{ aspectRatio: `${LAYOUT_WIDTH} / ${LAYOUT_HEIGHT}` }}
      aria-label={t('floor')}
    >
      {tables
        .filter((table) => table.isActive)
        .map((table) => (
          <button
            key={table.id}
            type="button"
            onClick={() => onSelect?.(table)}
            disabled={!onSelect}
            aria-label={table.name}
            aria-pressed={selectedId === table.id}
            className={cn(
              'absolute flex flex-col items-center justify-center overflow-hidden rounded-lg border-2 p-1 text-center text-sm leading-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              table.openOrders > 0 ? 'border-primary bg-primary/10' : 'border-border bg-background',
              selectedId === table.id && 'ring-3 ring-ring',
            )}
            style={{
              left: `${(table.x / LAYOUT_WIDTH) * 100}%`,
              top: `${(table.y / LAYOUT_HEIGHT) * 100}%`,
              width: `${(table.width / LAYOUT_WIDTH) * 100}%`,
              height: `${(table.height / LAYOUT_HEIGHT) * 100}%`,
            }}
          >
            <span className="max-w-full truncate font-semibold">{table.name}</span>
            <span className="max-w-full truncate text-xs text-muted-foreground">
              {renderBadge
                ? renderBadge(table)
                : table.openOrders > 0
                  ? t('orders', { count: table.openOrders })
                  : t('free')}
            </span>
          </button>
        ))}
    </div>
  )
}
