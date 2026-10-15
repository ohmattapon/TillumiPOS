import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/DatePicker'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { useFormat } from '@/features/settings'
import { presetRange, validRange, type Preset, type ReportFilters as Filters } from '../lib/date-range'

export function ReportFilters({ filters, today, branchName, onApply }: {
  filters: Filters; today: string; branchName: string; onApply: (filters: Filters) => void
}) {
  const { t } = useTranslation('reports')
  const { date, locale } = useFormat()
  const id = useId()
  const [draft, setDraft] = useState(filters)
  const valid = validRange(draft.from, draft.to)
  return (
    <form className="flex flex-col gap-3 rounded-xl border bg-card p-4" onSubmit={(event) => {
      event.preventDefault()
      if (valid) onApply(draft)
    }}>
      <FieldGroup className="flex-row flex-wrap items-end gap-3">
        <Field className="min-w-40 flex-1" data-invalid={!valid}>
          <FieldLabel htmlFor={`${id}-from`}>{t('from')}</FieldLabel>
          <DatePicker id={`${id}-from`} label={t('from')} value={draft.from} today={today} locale={locale} dateFormat={date}
            invalid={!valid} describedBy={!valid ? `${id}-error` : undefined} onChange={(from) => setDraft({ ...draft, from })} />
        </Field>
        <Field className="min-w-40 flex-1" data-invalid={!valid}>
          <FieldLabel htmlFor={`${id}-to`}>{t('to')}</FieldLabel>
          <DatePicker id={`${id}-to`} label={t('to')} value={draft.to} today={today} locale={locale} dateFormat={date}
            invalid={!valid} describedBy={!valid ? `${id}-error` : undefined} onChange={(to) => setDraft({ ...draft, to })} />
        </Field>
        <Field className="min-w-40 flex-1">
          <FieldLabel htmlFor={`${id}-scope`}>{t('scope')}</FieldLabel>
          <select id={`${id}-scope`} aria-label={t('scope')} value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value === 'all' ? 'all' : 'branch' })}
            className="h-11 rounded-md border bg-background px-3 text-sm text-foreground">
            <option value="branch">{branchName}</option>
            <option value="all">{t('allBranches')}</option>
          </select>
        </Field>
        <Button className="h-11" type="submit" disabled={!valid}>{t('apply')}</Button>
      </FieldGroup>
      <div className="flex flex-wrap gap-1.5">
        {(['today', 'week', 'month', 'previousMonth'] as Preset[]).map((preset) => {
          const range = presetRange(preset, today)
          const selected = filters.from === range.from && filters.to === range.to
          return <Button key={preset} type="button" className="h-11" variant={selected ? 'secondary' : 'ghost'}
            onClick={() => onApply({ ...range, scope: draft.scope })}>{t(preset)}</Button>
        })}
      </div>
      {!valid && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{t('invalidRange')}</p>}
    </form>
  )
}
