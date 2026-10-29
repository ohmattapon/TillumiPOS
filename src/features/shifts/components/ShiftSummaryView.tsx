import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SkeletonRows } from '@/components/Skeletons'
import { useFormat } from '@/features/settings'
import { createMoney } from '@/lib/money'
import { shiftSummaryQuery } from '../api'

interface Props {
  shiftId: number
  /** The currency the shift was opened in: an old shift is never shown in today's currency. */
  currency: string
  /** Refetch while the shift is still selling. */
  live?: boolean
}

/** The report of a shift: live while it sells, frozen from the moment counting started. */
export function ShiftSummaryView({ shiftId, currency, live = false }: Props) {
  const { t } = useTranslation('shifts')
  const { t: tc } = useTranslation()
  const { locale, date } = useFormat()
  const money = useMemo(() => createMoney(currency, locale), [currency, locale])
  const report = useQuery({ ...shiftSummaryQuery(shiftId), refetchInterval: live ? 10_000 : false })

  if (report.error) return <p className="text-sm text-destructive">{report.error.message}</p>
  if (!report.data) return <SkeletonRows rows={6} />

  const { summary, frozen, capturedAt, voidedAfterCutoff } = report.data
  const rows: [string, string][] = [
    [t('summary.saleCount'), String(summary.saleCount)],
    [t('summary.grossSales'), money.format(summary.grossSalesSatang)],
    [t('summary.voided', { count: summary.voidedCount }), money.format(summary.voidedSatang)],
    [t('summary.netSales'), money.format(summary.netSalesSatang)],
    ...summary.tendered.map(
      (tender): [string, string] => [
        t('summary.tender', { method: tc(`paymentMethods.${tender.method}`) }),
        money.format(tender.amountSatang),
      ],
    ),
    [t('summary.change'), money.format(summary.changeSatang)],
  ]
  const drawer: [string, string][] = [
    [t('summary.openingCash'), money.format(summary.openingCashSatang)],
    [t('summary.cashSales'), money.format(summary.cashSaleSatang)],
    [t('summary.cashIn'), money.format(summary.cashInSatang)],
    [t('summary.cashOut'), `-${money.format(summary.cashOutSatang)}`],
    [t('summary.cashRefund'), `-${money.format(summary.cashRefundSatang)}`],
  ]

  const list = (items: [string, string][]) =>
    items.map(([label, value]) => (
      <div key={label} className="flex justify-between gap-4 py-1">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="font-medium tabular-nums">{value}</dd>
      </div>
    ))

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        {frozen && capturedAt ? t('summary.frozenAt', { time: date.dateTime(capturedAt) }) : t('summary.live')}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-1 font-medium">{t('summary.salesTitle')}</h4>
          <dl className="divide-y">{list(rows)}</dl>
        </div>
        <div>
          <h4 className="mb-1 font-medium">{t('summary.drawerTitle')}</h4>
          <dl className="divide-y">
            {list(drawer)}
            <div className="flex justify-between gap-4 py-1 font-semibold">
              <dt>{t('summary.expectedCash')}</dt>
              <dd className="tabular-nums">{money.format(summary.expectedCashSatang)}</dd>
            </div>
          </dl>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('summary.bankNote')}</p>
      {voidedAfterCutoff.count > 0 && (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-foreground">
          {t('summary.voidedAfter', { count: voidedAfterCutoff.count, amount: money.format(voidedAfterCutoff.amountSatang) })}
        </p>
      )}
    </div>
  )
}
