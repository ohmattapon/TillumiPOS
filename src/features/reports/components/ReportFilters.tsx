import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/DatePicker'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useFormat } from '@/features/settings'
import { cashiersReportQuery } from '../api'
import { presetRange, validRange, type Preset, type ReportFilters as Filters } from '../lib/date-range'

export function ReportFilters({ filters, today, onApply }: {
  filters: Filters; today: string; onApply: (filters: Filters) => void
}) {
  const { t } = useTranslation('reports')
  const { date, locale } = useFormat()
  const id = useId()
  const [draft, setDraft] = useState(filters)
  const valid = validRange(draft.from, draft.to)
  const cashiers = useQuery({ ...cashiersReportQuery({ from: filters.from, to: filters.to }), enabled: validRange(filters.from, filters.to) })
  const cashierList = cashiers.data?.items ?? []
  // A cashier chosen in a link may have no bills in the dates shown, so the list would not name them.
  const missingCashier = draft.cashierId !== undefined && !cashierList.some((row) => row.cashierId === draft.cashierId)
  return (
    <form className="flex flex-col gap-3 rounded-[10px] border bg-card p-4" onSubmit={(event) => {
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
          <FieldLabel htmlFor={`${id}-cashier`}>{t('cashier')}</FieldLabel>
          <Select value={draft.cashierId === undefined ? 'all' : String(draft.cashierId)}
            onValueChange={(value) => setDraft({ ...draft, cashierId: value === 'all' ? undefined : Number(value) })}>
            <SelectTrigger id={`${id}-cashier`} className="h-11 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{t('allCashiers')}</SelectItem>
                {missingCashier && <SelectItem value={String(draft.cashierId)}>{t('unknownCashier', { id: draft.cashierId })}</SelectItem>}
                {cashierList.map((row) => <SelectItem key={row.cashierId} value={String(row.cashierId)}>{row.cashierName}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="min-w-40 flex-1">
          <FieldLabel htmlFor={`${id}-customer`}>{t('customer')}</FieldLabel>
          <Select value={draft.customer ?? 'all'}
            onValueChange={(value) => setDraft({ ...draft, customer: value === 'member' || value === 'guest' ? value : undefined })}>
            <SelectTrigger id={`${id}-customer`} className="h-11 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{t('allCustomers')}</SelectItem>
                <SelectItem value="member">{t('memberCustomers')}</SelectItem>
                <SelectItem value="guest">{t('guestCustomers')}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Switch checked={draft.compare} onCheckedChange={(compare) => setDraft({ ...draft, compare })} />
          {t('compare')}
        </label>
        <Button className="h-11" type="submit" disabled={!valid}>{t('apply')}</Button>
      </FieldGroup>
      <div className="flex flex-wrap gap-1.5">
        {(['today', 'week', 'month', 'previousMonth'] as Preset[]).map((preset) => {
          const range = presetRange(preset, today)
          const selected = filters.from === range.from && filters.to === range.to
          // A preset changes the dates only: the cashier, the customer kind and compare stay as they are applied.
          return <Button key={preset} type="button" className="h-11" variant={selected ? 'secondary' : 'ghost'}
            onClick={() => onApply({ ...filters, ...range })}>{t(preset)}</Button>
        })}
      </div>
      {!valid && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{t('invalidRange')}</p>}
    </form>
  )
}
