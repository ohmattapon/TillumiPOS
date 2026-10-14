import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SkeletonRows } from '@/components/Skeletons'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useFormat } from '@/features/settings'
import { createMoney } from '@/lib/money'
import { shiftHistoryQuery, type ShiftStatusFilter } from '../api'
import { ShiftSummaryView } from './ShiftSummaryView'

const PAGE_SIZE = 10
const statuses: ShiftStatusFilter[] = ['all', 'open', 'closing', 'closed']

/** Past and current shifts of the branch: filter, page through, and open one to see its report. */
export function ShiftHistoryPanel({ registers }: { registers: { id: number; code: string; name: string }[] }) {
  const { t } = useTranslation('shifts')
  const { date, locale } = useFormat()
  const [registerId, setRegisterId] = useState<number | null>(null)
  const [status, setStatus] = useState<ShiftStatusFilter>('all')
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<number | null>(null)

  const history = useQuery(shiftHistoryQuery({ registerId, status, limit: PAGE_SIZE, offset: page * PAGE_SIZE }))
  const total = history.data?.total ?? 0
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)
  const registerName = useMemo(() => new Map(registers.map((item) => [item.id, item.name])), [registers])

  const filter = (change: () => void) => {
    change()
    setPage(0)
    setOpenId(null)
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">{t('history')}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="shift-history-register">{t('register')}</Label>
          <Select
            value={registerId === null ? 'all' : String(registerId)}
            onValueChange={(value) => filter(() => setRegisterId(value === 'all' ? null : Number(value)))}
          >
            <SelectTrigger id="shift-history-register" className="h-10! w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                <SelectItem value="all">{t('historyAllRegisters')}</SelectItem>
                {registers.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.code} · {item.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="shift-history-status">{t('status')}</Label>
          <Select
            value={status}
            onValueChange={(value) => filter(() => setStatus(value as ShiftStatusFilter))}
          >
            <SelectTrigger id="shift-history-status" className="h-10! w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                {statuses.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value === 'all' ? t('historyAllStatuses') : t(`status_${value}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      {history.error && <p className="text-sm text-destructive">{history.error.message}</p>}
      {!history.isPending && total === 0 && <p className="text-sm text-muted-foreground">{t('historyEmpty')}</p>}

      <ul className="divide-y">
        {history.isPending && (
          <li>
            <SkeletonRows rows={3} />
          </li>
        )}
        {history.data?.items.map((shift) => {
          const money = createMoney(shift.currency, locale)
          const isOpen = openId === shift.id
          return (
            <li key={shift.id} className="py-3 text-sm">
              <button
                type="button"
                aria-expanded={isOpen}
                className="flex w-full flex-wrap items-center justify-between gap-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => setOpenId(isOpen ? null : shift.id)}
              >
                <span className="font-medium">
                  {registerName.get(shift.registerId) ?? t('register')} · {shift.openedByName}
                </span>
                <span className="text-muted-foreground">{date.dateTime(shift.openedAt)}</span>
                <span className="rounded-full bg-muted px-2 py-1">{t(`status_${shift.status}`)}</span>
              </button>

              {isOpen && (
                <div className="mt-3 space-y-3 rounded-lg bg-muted/50 p-4">
                  {shift.status === 'closed' && (
                    <dl className="grid gap-x-6 gap-y-1 md:grid-cols-2">
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">{t('detail.closedBy')}</dt>
                        <dd>
                          {shift.closedByName}
                          {shift.closedAt ? ` · ${date.dateTime(shift.closedAt)}` : ''}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">{t('countedCash')}</dt>
                        <dd className="font-medium tabular-nums">{money.format(shift.countedCashSatang ?? 0)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">{t('detail.difference')}</dt>
                        <dd
                          className={`font-medium tabular-nums ${shift.cashDifferenceSatang ? 'text-destructive' : ''}`}
                        >
                          {(shift.cashDifferenceSatang ?? 0) < 0 ? '-' : ''}
                          {money.format(Math.abs(shift.cashDifferenceSatang ?? 0))}
                        </dd>
                      </div>
                      {shift.differenceReason && (
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">{t('differenceReason')}</dt>
                          <dd>{shift.differenceReason}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  <ShiftSummaryView shiftId={shift.id} currency={shift.currency} live={shift.status === 'open'} />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <Button variant="outline" className="h-10" disabled={page === 0} onClick={() => setPage(page - 1)}>
            {t('historyPrevious')}
          </Button>
          <span className="text-muted-foreground tabular-nums">
            {t('historyPage', { page: page + 1, pages: lastPage + 1 })}
          </span>
          <Button variant="outline" className="h-10" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>
            {t('historyNext')}
          </Button>
        </div>
      )}
    </section>
  )
}
