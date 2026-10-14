import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { presetRange, validRange, type Preset, type ReportFilters as Filters } from '../lib/date-range'

export function ReportFilters({ filters, today, branchName, onApply }: {
  filters: Filters; today: string; branchName: string; onApply: (filters: Filters) => void
}) {
  const { t } = useTranslation('reports')
  const [draft, setDraft] = useState(filters)
  const valid = validRange(draft.from, draft.to)
  return (
    <form className="space-y-3 rounded-xl border bg-card p-4" onSubmit={(event) => {
      event.preventDefault()
      if (valid) onApply(draft)
    }}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          {t('from')}
          <Input type="date" aria-label={t('from')} value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} className="w-40 text-foreground" required />
        </label>
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          {t('to')}
          <Input type="date" aria-label={t('to')} value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} className="w-40 text-foreground" required />
        </label>
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          {t('scope')}
          <select aria-label={t('scope')} value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value === 'all' ? 'all' : 'branch' })}
            className="h-9 max-w-64 rounded-md border bg-background px-3 text-sm text-foreground">
            <option value="branch">{branchName}</option>
            <option value="all">{t('allBranches')}</option>
          </select>
        </label>
        <Button type="submit" disabled={!valid}>{t('apply')}</Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(['today', 'week', 'month', 'previousMonth'] as Preset[]).map((preset) => {
          const range = presetRange(preset, today)
          const selected = filters.from === range.from && filters.to === range.to
          return <Button key={preset} type="button" size="sm" variant={selected ? 'secondary' : 'ghost'}
            onClick={() => onApply({ ...range, scope: draft.scope })}>{t(preset)}</Button>
        })}
      </div>
      {!valid && <p role="alert" className="text-xs text-destructive">{t('invalidRange')}</p>}
    </form>
  )
}
