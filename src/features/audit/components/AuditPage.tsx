import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { DataTable } from '@/components/DataTable'
import { DatePicker } from '@/components/DatePicker'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Panel'
import { PaginationBar } from '@/components/PaginationBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFormat, useSettings } from '@/features/settings'
import { todayIn } from '@/lib/calendar-date'
import { auditLogsQuery, type AuditFilters, type AuditRecord } from '../api'
import { locales } from '../locales'
import { isRangeInOrder } from '../lib/date-range'
import { auditChanges, describeEntry } from '../lib/describe-entry'
const actions = Object.keys(locales.th.actions) as (keyof typeof locales.th.actions)[]

export function AuditPage() {
  const { t } = useTranslation('audit'), { t: tc } = useTranslation()
  const { date, locale } = useFormat()
  const shop = useSettings()
  const [today] = useState(() => todayIn(shop.timeZone))
  const initial = { from: '', to: '', actorId: '', action: '' }
  const [form, setForm] = useState(initial)
  const [filters, setFilters] = useState<AuditFilters>({})
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<AuditRecord | null>(null)
  const result = useQuery(auditLogsQuery({ ...filters, limit: 50, offset: page * 50 }))
  const rangeInOrder = isRangeInOrder(form.from, form.to)
  const changes = selected ? auditChanges(selected.before, selected.after) : []
  const apply = (event: FormEvent) => {
    event.preventDefault()
    if (!rangeInOrder) return
    setFilters({ ...(form.from && { from: form.from }), ...(form.to && { to: form.to }), ...(form.actorId && { actorId: Number(form.actorId) }), ...(form.action && { action: form.action }) })
    setPage(0); setSelected(null)
  }
  return <>
    <PageHeader title={t('title')} description={t('description')} />
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <form onSubmit={apply} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="min-w-0 space-y-2" data-invalid={!rangeInOrder}>
          <Label htmlFor="audit-from">{t('from')}</Label>
          <DatePicker id="audit-from" label={t('from')} value={form.from} today={today} locale={locale} dateFormat={date}
            invalid={!rangeInOrder} describedBy={!rangeInOrder ? 'audit-range-error' : undefined} onChange={(from) => setForm({ ...form, from })} />
        </div>
        <div className="min-w-0 space-y-2" data-invalid={!rangeInOrder}>
          <Label htmlFor="audit-to">{t('to')}</Label>
          <DatePicker id="audit-to" label={t('to')} value={form.to} today={today} locale={locale} dateFormat={date}
            invalid={!rangeInOrder} describedBy={!rangeInOrder ? 'audit-range-error' : undefined} onChange={(to) => setForm({ ...form, to })} />
        </div>
        <div className="min-w-0 space-y-2"><Label htmlFor="audit-actorId">{t('actor')}</Label><Input id="audit-actorId" className="h-11 w-full" type="number" min={1} value={form.actorId} onChange={(event) => setForm({ ...form, actorId: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="audit-action">{t('action')}</Label><select id="audit-action" className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value })}><option value="">{t('all')}</option>{actions.map((action) => <option key={action} value={action}>{t(`actions.${action}`)}</option>)}</select></div>
        <div className="flex gap-2"><Button type="submit" className="h-11" disabled={!rangeInOrder}>{t('apply')}</Button><Button variant="outline" type="button" className="h-11" onClick={() => { setForm(initial); setFilters({}); setPage(0); setSelected(null) }}>{t('reset')}</Button></div>
        {!rangeInOrder && <p id="audit-range-error" role="alert" className="text-xs text-destructive sm:col-span-2 lg:col-span-5">{t('invalidRange')}</p>}
        {(form.from || form.to) && <Button type="button" variant="outline" className="h-11 justify-self-start sm:col-span-2 lg:col-span-5" onClick={() => setForm({ ...form, from: '', to: '' })}>{t('clearDates')}</Button>}
      </form>
      <Panel title={t('title')}>
        {result.error && <p role="alert" className="p-4 text-sm text-destructive">{result.error.message}</p>}
        <DataTable rows={result.data?.items ?? []} rowKey={(row) => row.id} empty={t('empty')} isPending={result.isPending} onSelect={(row) => setSelected(selected?.id === row.id ? null : row)} rowLabel={(row) => `${date.dateTime(row.at)} ${row.actorName}`} columns={[
          { id: 'time', header: t('time'), priority: 'primary', cell: (row) => date.dateTime(row.at) },
          { id: 'actor', header: t('person'), priority: 'primary', cell: (row) => <span>{row.actorName}{row.actorId !== null && <span className="ml-1 text-xs text-muted-foreground">#{row.actorId}</span>}</span> },
          { id: 'summary', header: t('summary'), priority: 'secondary', cell: (row) => describeEntry(row, (key) => t(key, { defaultValue: row.action })) },
        ]} />
        <PaginationBar page={page} pageSize={50} total={result.data?.total} isLoading={result.isPending} onPageChange={(next) => { setPage(next); setSelected(null) }} />
      </Panel>
      {selected && <Panel title={t('details')} description={describeEntry(selected, (key) => t(key, { defaultValue: selected.action }))} action={<Button variant="ghost" className="h-11" onClick={() => setSelected(null)}>{tc('close')}</Button>}>
        {selected.reason && <p className="px-4 py-3 text-sm">{t('reason')}: {selected.reason}</p>}
        <DataTable rows={changes} rowKey={(row) => row.field} empty={t('noChanges')} columns={[
          { id: 'field', header: t('field'), priority: 'primary', cell: (row) => row.field },
          { id: 'before', header: t('before'), priority: 'secondary', className: 'max-w-56 whitespace-normal break-words', cell: (row) => row.before ?? t('noValue') },
          { id: 'after', header: t('after'), priority: 'secondary', className: 'max-w-56 whitespace-normal break-words', cell: (row) => row.after ?? t('noValue') },
        ]} />
      </Panel>}
    </div>
  </>
}
