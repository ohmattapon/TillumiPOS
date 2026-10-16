import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Panel'
import { PaginationBar } from '@/components/PaginationBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFormat } from '@/features/settings'
import { auditLogsQuery, type AuditFilters, type AuditRecord } from '../api'
import { locales } from '../locales'
import { auditChanges, describeEntry } from '../lib/describe-entry'
const actions = Object.keys(locales.th.actions) as (keyof typeof locales.th.actions)[]

export function AuditPage() {
  const { t } = useTranslation('audit'), { t: tc } = useTranslation()
  const { date } = useFormat()
  const initial = { from: '', to: '', actorId: '', action: '' }
  const [form, setForm] = useState(initial)
  const [filters, setFilters] = useState<AuditFilters>({})
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<AuditRecord | null>(null)
  const result = useQuery(auditLogsQuery({ ...filters, limit: 50, offset: page * 50 }))
  const changes = selected ? auditChanges(selected.before, selected.after) : []
  const apply = (event: FormEvent) => {
    event.preventDefault()
    setFilters({ ...(form.from && { from: form.from }), ...(form.to && { to: form.to }), ...(form.actorId && { actorId: Number(form.actorId) }), ...(form.action && { action: form.action }) })
    setPage(0); setSelected(null)
  }
  return <>
    <PageHeader title={t('title')} description={t('description')} />
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <form onSubmit={apply} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(['from', 'to', 'actorId'] as const).map((field) => <div key={field} className="min-w-0 space-y-2"><Label htmlFor={`audit-${field}`}>{t(field === 'actorId' ? 'actor' : field)}</Label><Input id={`audit-${field}`} className="h-11 w-full" type={field === 'actorId' ? 'number' : 'date'} min={field === 'actorId' ? 1 : field === 'to' ? form.from : undefined} value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></div>)}
        <div className="space-y-2"><Label htmlFor="audit-action">{t('action')}</Label><select id="audit-action" className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value })}><option value="">{t('all')}</option>{actions.map((action) => <option key={action} value={action}>{t(`actions.${action}`)}</option>)}</select></div>
        <div className="flex gap-2"><Button type="submit" className="h-11">{t('apply')}</Button><Button variant="outline" type="button" className="h-11" onClick={() => { setForm(initial); setFilters({}); setPage(0); setSelected(null) }}>{t('reset')}</Button></div>
      </form>
      <Panel title={t('title')}>
        {result.error && <p role="alert" className="p-4 text-sm text-destructive">{result.error.message}</p>}
        <DataTable rows={result.data?.items ?? []} rowKey={(row) => row.id} empty={t('empty')} isPending={result.isPending} onSelect={(row) => setSelected(selected?.id === row.id ? null : row)} rowLabel={(row) => `${date.dateTime(row.at)} ${row.actorName}`} columns={[
          { id: 'time', header: t('time'), priority: 'primary', cell: (row) => date.dateTime(row.at) },
          { id: 'actor', header: t('person'), priority: 'primary', cell: (row) => <span>{row.actorName}{row.actorId !== null && <span className="ml-1 text-xs text-muted-foreground">#{row.actorId}</span>}</span> },
          { id: 'summary', header: t('summary'), priority: 'secondary', cell: (row) => describeEntry(row, (key) => t(key, { defaultValue: row.action })) },
          { id: 'branch', header: t('branch'), priority: 'wide-only', cell: (row) => row.branchId ?? t('noValue') },
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
