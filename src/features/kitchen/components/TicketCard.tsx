import type { KitchenBoardTicket } from '@pos/api/types'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useFormat } from '@/features/settings'
import { cn } from '@/lib/utils'
import { isLineCancelled, isTicketCancelled, liveUnits, ticketHeading } from '../lib/tickets'

interface Props {
  ticket: KitchenBoardTicket
  disabled: boolean
  onDone: () => void
}

/** One ticket: where it belongs, what to make, what was taken back, and the done button. */
export function TicketCard({ ticket, disabled, onDone }: Props) {
  const { t } = useTranslation('kitchen')
  const { date } = useFormat()
  const cancelled = isTicketCancelled(ticket.lines)

  return (
    <article className={cn('flex flex-col gap-3 rounded-xl border bg-card p-4', cancelled && 'opacity-70')}>
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="min-w-0 truncate text-lg font-semibold">
          {ticketHeading(ticket, (id) => t('orderNumber', { id }))}
        </h2>
        <span className="shrink-0 text-xs text-muted-foreground">{t('round', { count: ticket.roundNo })}</span>
      </header>
      <p className="text-xs text-muted-foreground">{t('sentAt', { time: date.dateTime(ticket.createdAt) })}</p>
      {cancelled && <p className="text-sm font-medium text-destructive">{t('cancelledTicket')}</p>}

      <ul className="divide-y">
        {ticket.lines.map((line) => (
          <li key={line.id} className="space-y-1 py-2">
            <p className={cn('text-base font-medium', isLineCancelled(line) && 'text-muted-foreground line-through')}>
              {/* A line taken back in full keeps its ordered count, so the crossed-out row still says what it was. */}
              <span className="tabular-nums">{isLineCancelled(line) ? line.quantity : liveUnits(line)} ×</span> {line.productName}
            </p>
            {line.optionNames.length > 0 && <p className="text-sm text-muted-foreground">{line.optionNames.join(', ')}</p>}
            {line.note && <p className="text-sm font-medium">{t('note', { note: line.note })}</p>}
            {line.voidedQuantity > 0 && (
              <p className="text-sm font-medium text-destructive">{t('cancelledUnits', { count: line.voidedQuantity })}</p>
            )}
          </li>
        ))}
      </ul>

      <Button className="h-11 w-full text-base" disabled={disabled} onClick={onDone}>
        {t('done')}
      </Button>
    </article>
  )
}
