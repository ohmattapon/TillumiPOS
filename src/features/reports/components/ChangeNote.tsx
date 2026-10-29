import { useTranslation } from 'react-i18next'
import { percentChange } from '@pos/api/reports'
import { cn } from '@/lib/utils'
import { formatBasisPoints } from '../lib/report-format'

/**
 * How a figure moved against the period before it. The arrow and the number always come with the colour,
 * so the direction never rests on colour alone. `previous` undefined means the comparison is off.
 */
export function ChangeNote({ current, previous, previousText }: {
  current: number; previous: number | undefined; previousText: string
}) {
  const { t } = useTranslation('reports')
  if (previous === undefined) return null
  const change = percentChange(current, previous)
  if (change === null) {
    return <p className="mt-1 text-xs text-muted-foreground">
      <span aria-hidden>—</span><span className="sr-only">{t('noComparison')}</span>{' '}
      {t('previousValue', { value: previousText })}
    </p>
  }
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      <span className={cn('font-medium tabular-nums', direction === 'up' && 'text-success', direction === 'down' && 'text-destructive')}>
        {direction !== 'flat' && <span aria-hidden>{direction === 'up' ? '▲' : '▼'} </span>}
        <span className="sr-only">{t(direction === 'up' ? 'increased' : direction === 'down' ? 'decreased' : 'unchanged')} </span>
        {formatBasisPoints(change)}
      </span>
      {' '}{t('previousValue', { value: previousText })}
    </p>
  )
}
