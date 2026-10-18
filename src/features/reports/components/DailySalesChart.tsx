import type { SalesReport } from '@pos/api/types'
import { useTranslation } from 'react-i18next'
import { useFormat } from '@/features/settings'

export function DailySalesChart({ days }: { days: SalesReport['days']['items'] }) {
  const { t } = useTranslation('reports')
  const { money, date } = useFormat()
  const peak = Math.max(1, ...days.map((day) => day.totalSatang))
  const width = 880 / Math.max(1, days.length)
  const labels = [0, Math.floor((days.length - 1) / 2), days.length - 1]
    .filter((value, index, values) => value >= 0 && values.indexOf(value) === index)
  if (days.every((day) => day.totalSatang === 0)) return <p className="px-4 py-6 text-sm text-muted-foreground">{t('empty')}</p>
  return <div className="flex gap-3 px-4 pt-5 pb-3">
    <div aria-hidden="true" className="flex h-36 shrink-0 flex-col justify-between text-right text-[11px] text-muted-foreground tabular-nums">
      {[1, 0.5, 0].map((ratio) => <span key={ratio}>{money.plain(Math.round(peak * ratio))}</span>)}
    </div>
    <div className="min-w-0 flex-1">
      <svg viewBox="0 0 880 145" preserveAspectRatio="none" role="img" aria-label={t('daily')} className="h-36 w-full">
        <title>{t('daily')}</title>
        {[0, 0.5, 1].map((ratio) => <line key={ratio} x1="0" x2="880" y1={145 - ratio * 145} y2={145 - ratio * 145} className="stroke-border" />)}
        {days.map((day, i) => {
          const height = day.totalSatang / peak * 145
          const barWidth = Math.min(80, width * 0.7)
          return <rect key={day.day} x={i * width + (width - barWidth) / 2} y={145 - height} width={barWidth} height={height} rx={Math.min(3, width / 4)} className="fill-primary">
            <title>{day.day}: {money.format(day.totalSatang)}</title>
          </rect>
        })}
      </svg>
      <div aria-hidden="true" className={`mt-2 flex text-[11px] text-muted-foreground ${labels.length === 1 ? 'justify-center' : 'justify-between'}`}>
        {labels.map((index) => <span key={index}>{date.calendarDayMonth(days[index]!.day)}</span>)}
      </div>
    </div>
  </div>
}
