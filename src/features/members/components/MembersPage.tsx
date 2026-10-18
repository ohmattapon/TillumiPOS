import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { todayIn } from '@/lib/calendar-date'
import { Panel, tableToolbar } from '@/components/Panel'
import { DataTable } from '@/components/DataTable'
import { TableSearch } from '@/components/TableSearch'
import { PaginationBar } from '@/components/PaginationBar'
import { DatePicker } from '@/components/DatePicker'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCan } from '@/features/auth'
import { Receipt } from '@/features/sales'
import { useFormat, useSettings } from '@/features/settings'
import { api, unwrap } from '@/lib/api'
import { memberHistoryQuery, memberQuery, membersQuery, useUpdateMember } from '../api'
import { MemberFormDialog } from './MemberFormDialog'

export function MembersPage() {
  const { t } = useTranslation('members')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const search = params.get('search') ?? ''
  const active = params.get('active') ?? 'all'
  const page = Math.max(0, Number(params.get('page')) || 0)
  const [creating, setCreating] = useState(false)
  const members = useQuery(
    membersQuery({
      search: search || undefined,
      isActive: active === 'all' ? undefined : active === 'true',
      limit: 20,
      offset: page * 20,
    }),
  )
  const filter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    next.set(key, value)
    next.delete('page')
    setParams(next, { replace: true })
  }
  const memberSearch = <TableSearch value={search} onChange={(value) => filter('search', value)} label={t('search')} placeholder={t('search')} />

  return (
    <>
      <PageHeader title={t('title')} description={t('description')}>
        <Button className="h-11" onClick={() => setCreating(true)}>
          <Plus data-icon="inline-start" />
          {t('create')}
        </Button>
      </PageHeader>
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="flex flex-wrap gap-3">
          <Select value={active} onValueChange={(value) => filter('active', value)}>
            <SelectTrigger className="h-11 w-40" aria-label={t('status')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{t('all')}</SelectItem>
                <SelectItem value="true">{t('active')}</SelectItem>
                <SelectItem value="false">{t('inactive')}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Panel title={t('directory')}>
          {/* Drawn here, not in DataTable's toolbar: the table is hidden while a request fails, and a search that moved between the two places would be rebuilt and lose focus. */}
          <div className={tableToolbar}>{memberSearch}</div>
          {members.error && (
            <p role="alert" className="p-4 text-sm text-destructive">
              {members.error.message}
              <Button variant="link" onClick={() => void members.refetch()}>
                {t('retry')}
              </Button>
            </p>
          )}
          {!members.error && (
            <DataTable
              rows={members.data?.items ?? []}
              rowKey={(member) => member.id}
              isPending={members.isPending}
              empty={t('empty')}
              onSelect={(member) => navigate(`/members/${member.id}`)}
              rowLabel={(member) => member.name}
              columns={[
                { id: 'name', header: t('name'), priority: 'primary', cell: (member) => member.name },
                { id: 'code', header: t('code'), priority: 'secondary', cell: (member) => member.code },
                { id: 'phone', header: t('phone'), priority: 'secondary', cell: (member) => member.phone },
                {
                  id: 'status',
                  header: t('status'),
                  priority: 'secondary',
                  cell: (member) => (
                    <Badge variant={member.isActive ? 'secondary' : 'outline'}>
                      {t(member.isActive ? 'active' : 'inactive')}
                    </Badge>
                  ),
                },
              ]}
            />
          )}
          <PaginationBar
            page={page}
            pageSize={20}
            total={members.data?.total}
            isLoading={members.isPending}
            onPageChange={(value) => {
              const next = new URLSearchParams(params)
              next.set('page', String(value))
              setParams(next)
            }}
          />
        </Panel>
      </main>
      {creating && <MemberFormDialog onClose={() => setCreating(false)} />}
    </>
  )
}

export function MemberDetailsPage() {
  const { t } = useTranslation('members')
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const member = useQuery(memberQuery(id))
  const canEdit = useCan('members.write')
  const update = useUpdateMember()
  const { money, date, locale } = useFormat()
  const shop = useSettings()
  const [editing, setEditing] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(0)
  const [receiptId, setReceiptId] = useState<number | null>(null)
  const receipt = useQuery({
    queryKey: ['sales', 'detail', receiptId],
    queryFn: () => unwrap(api.sales({ id: receiptId! }).get()),
    enabled: receiptId !== null,
  })
  const history = useQuery({
    ...memberHistoryQuery(
      id,
      {
        from: from || undefined,
        to: to || undefined,
        status: status === 'completed' || status === 'voided' ? status : undefined,
        limit: 20,
        offset: page * 20,
      },
    ),
    enabled: !from || !to || from <= to,
  })
  const [today] = useState(() => todayIn(shop.timeZone))
  return (
    <>
      <PageHeader
        title={member.data?.name ?? t('title')}
        description={member.data ? `${member.data.code} / ${member.data.phone}` : undefined}
      >
        <Button
          variant="outline"
          className="size-11"
          aria-label={t('back')}
          onClick={() => navigate('/members')}
        >
          <ArrowLeft />
        </Button>
      </PageHeader>
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {member.isPending && <Skeleton className="h-14 w-full" />}
        {member.error && (
          <p role="alert" className="text-sm text-destructive">
            {member.error.message}
            <Button variant="link" onClick={() => void member.refetch()}>
              {t('retry')}
            </Button>
          </p>
        )}
        {member.data && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={member.data.isActive ? 'secondary' : 'outline'}>
              {t(member.data.isActive ? 'active' : 'inactive')}
            </Badge>
            {canEdit && (
              <>
                <Button variant="outline" className="h-11" onClick={() => setEditing(true)}>
                  {t('edit')}
                </Button>
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id, changes: { isActive: !member.data!.isActive } })}
                >
                  {t(member.data.isActive ? 'deactivate' : 'activate')}
                </Button>
              </>
            )}
          </div>
        )}
        {update.error && (
          <p role="alert" className="text-sm text-destructive">
            {update.error.message}
          </p>
        )}
        <Panel title={t('history')} description={t('historyHint')}>
          <FieldGroup className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="member-from">{t('from')}</FieldLabel>
              <DatePicker
                id="member-from"
                label={t('from')}
                value={from}
                today={today}
                locale={locale}
                dateFormat={date}
                invalid={Boolean(from && to && from > to)}
                onChange={(value) => {
                  setFrom(value)
                  setPage(0)
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="member-to">{t('to')}</FieldLabel>
              <DatePicker
                id="member-to"
                label={t('to')}
                value={to}
                today={today}
                locale={locale}
                dateFormat={date}
                invalid={Boolean(from && to && from > to)}
                onChange={(value) => {
                  setTo(value)
                  setPage(0)
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="member-status">{t('status')}</FieldLabel>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value)
                  setPage(0)
                }}
              >
                <SelectTrigger id="member-status" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">{t('all')}</SelectItem>
                    <SelectItem value="completed">{t('completed')}</SelectItem>
                    <SelectItem value="voided">{t('voided')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-end">
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  setFrom('')
                  setTo('')
                  setPage(0)
                }}
              >
                {t('clearDates')}
              </Button>
            </div>
          </FieldGroup>
          {from && to && from > to && (
            <p role="alert" className="px-4 pb-4 text-sm text-destructive">
              {t('invalidRange')}
            </p>
          )}
          <dl className="flex flex-wrap gap-x-8 gap-y-3 border-y px-4 py-3">
            <div>
              <dt className="text-xs text-muted-foreground">{t('count')}</dt>
              <dd className="font-semibold tabular-nums">{history.data?.summary.saleCount ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('total')}</dt>
              <dd className="font-semibold tabular-nums">
                {history.data ? money.format(history.data.summary.totalSatang) : '-'}
              </dd>
            </div>
          </dl>
          {history.error && (
            <p role="alert" className="p-4 text-sm text-destructive">
              {history.error.message}
              <Button variant="link" onClick={() => void history.refetch()}>
                {t('retry')}
              </Button>
            </p>
          )}
          {!history.error && (!from || !to || from <= to) && (
            <DataTable
              rows={history.data?.items ?? []}
              rowKey={(sale) => sale.id}
              isPending={history.isPending}
              empty={t('noHistory')}
              onSelect={(sale) => setReceiptId(sale.id)}
              rowLabel={(sale) => `${t('viewReceipt')} ${sale.receiptNo}`}
              columns={[
                { id: 'receipt', header: t('receipt'), priority: 'primary', cell: (sale) => sale.receiptNo },
                {
                  id: 'date',
                  header: t('date'),
                  priority: 'secondary',
                  cell: (sale) => date.dateTime(sale.createdAt),
                },
                {
                  id: 'amount',
                  header: t('amount'),
                  priority: 'primary',
                  align: 'right',
                  cell: (sale) => money.format(sale.totalSatang),
                },
                {
                  id: 'status',
                  header: t('status'),
                  priority: 'secondary',
                  cell: (sale) => <Badge variant="outline">{t(sale.status)}</Badge>,
                },
                {
                  id: 'cashier',
                  header: t('cashier'),
                  priority: 'wide-only',
                  cell: (sale) => sale.cashierName,
                },
              ]}
            />
          )}
          <PaginationBar
            page={page}
            pageSize={20}
            total={history.data?.total}
            isLoading={history.isPending}
            onPageChange={setPage}
          />
        </Panel>
        {receiptId !== null && (
          <Panel
            title={t('viewReceipt')}
            action={
              <Button className="h-11" variant="outline" onClick={() => setReceiptId(null)}>
                {t('cancel')}
              </Button>
            }
          >
            <div className="p-4">
              {receipt.isPending && <Skeleton className="h-40 w-full" />}
              {receipt.error && (
                <p role="alert">
                  {receipt.error.message}
                  <Button variant="link" onClick={() => void receipt.refetch()}>
                    {t('retry')}
                  </Button>
                </p>
              )}
              {receipt.data && <Receipt sale={receipt.data} />}
            </div>
          </Panel>
        )}
      </main>
      {editing && member.data && <MemberFormDialog member={member.data} onClose={() => setEditing(false)} />}
    </>
  )
}
