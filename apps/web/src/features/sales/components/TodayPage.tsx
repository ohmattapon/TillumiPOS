import { useQuery } from '@tanstack/react-query'
import { PackageX, ShoppingCart } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { SkeletonRows } from '@/components/Skeletons'
import { Skeleton } from '@/components/ui/skeleton'
import { Panel } from '@/components/Panel'
import { DataTable } from '@/components/DataTable'
import { PaginationBar } from '@/components/PaginationBar'
import { useListPagination } from '@/hooks/use-list-pagination'
import { SaleDetailDialog } from './SaleDetailDialog'
import { SegmentedTabs } from '@/components/SegmentedTabs'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { LOW_STOCK_THRESHOLD, productsQuery } from '@/features/products'
import { useFormat } from '@/features/settings'
import { useCan } from '@/features/auth'
import { salesTodayQuery, summaryTodayQuery } from '../api'

type StatusFilter = 'all' | 'completed' | 'voided'

interface StatProps {
  label: string
  value: string
  note?: ReactNode
  footer: string
}

function SummaryValue({ label, value, note, footer }: StatProps) {
  return (
    <div className="min-w-0 bg-card p-3 sm:p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-xl font-semibold tabular-nums">{value}</dd>
      <dd className="mt-1 text-xs text-muted-foreground">{footer}</dd>
      {note && <dd className="mt-1 text-xs">{note}</dd>}
    </div>
  )
}

function RetryNotice({ error, stale, pending, onRetry }: { error: Error; stale: boolean; pending: boolean; onRetry: () => void }) {
  const { t } = useTranslation('sales')
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 p-3">
      <p className="text-sm text-destructive">{stale ? t('today.refreshFailed') : error.message}</p>
      <Button variant="outline" className="h-11" disabled={pending} onClick={onRetry}>{t('today.retry')}</Button>
    </div>
  )
}

export function TodayPage({ isOwner }: { isOwner: boolean }) {
  const canVoid = useCan('sales.void')
  const { t } = useTranslation('sales')
  const { t: tc } = useTranslation()
  const { money, date } = useFormat()
  const summary = useQuery({ ...summaryTodayQuery, enabled: isOwner })

  const [filter, setFilter] = useState<StatusFilter>('all')
  const paging = useListPagination(filter)
  const lowPaging = useListPagination('low-stock', 8)
  const sales = useQuery(salesTodayQuery({
    status: filter === 'all' ? undefined : filter, limit: paging.pageSize, offset: paging.offset,
  }))
  const saleCount = useQuery(salesTodayQuery({ limit: 1 }))
  const voided = useQuery(salesTodayQuery({ status: 'voided', limit: 1 }))
  const products = useQuery(productsQuery({ stockAtMost: LOW_STOCK_THRESHOLD, sort: 'stock', limit: lowPaging.pageSize, offset: lowPaging.offset }))
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [today] = useState(() => new Date())

  const voidedCount = voided.data?.total ?? 0
  const visibleSales = sales.data?.items ?? []
  const lowStock = products.data?.items ?? []
  const lowStockCount = products.data?.total ?? 0

  const stats = summary.data
  const averageSatang = stats && stats.saleCount > 0 ? Math.round(stats.totalSatang / stats.saleCount) : 0
  const marginPercent = stats && stats.totalSatang > 0 ? Math.round((stats.profitSatang / stats.totalSatang) * 100) : 0

  return (
    <>
      <PageHeader
        title={t('today.title')}
        highlight={date.longDate(today)}
        description={
          saleCount.data === undefined || voided.data === undefined
            ? undefined
            : t('today.summary', { count: saleCount.data.total, voided: voidedCount })
        }
      >
        {lowStockCount > 0 && (
          <StatusBadge tone="warning" className="hidden h-7 px-3 sm:inline-flex">
            {t('today.lowStockBadge', { items: tc('items', { count: lowStockCount }) })}
          </StatusBadge>
        )}
        <Button asChild className="h-11 px-3">
          <Link to="/">
            <ShoppingCart />
            {t('today.openPos')}
          </Link>
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {isOwner && (
          <section aria-label={t('today.totals')} className="overflow-hidden rounded-md border bg-card">
            {summary.error && (
              <RetryNotice error={summary.error} stale={!!stats} pending={summary.isFetching} onRetry={() => void summary.refetch()} />
            )}
            {summary.isPending && <p role="status" className="sr-only">{tc('loading')}</p>}
            <dl aria-busy={summary.isPending} className="grid grid-cols-2 gap-px bg-border xl:grid-cols-4">
            {stats ? (
              <>
                <SummaryValue
                  label={t('stats.netSales')}
                  value={money.format(stats.totalSatang)}
                  footer={t('stats.totalDiscount', { amount: money.format(stats.discountSatang) })}
                />
                <SummaryValue
                  label={t('stats.saleCount')}
                  value={String(stats.saleCount)}
                  note={voidedCount > 0 && <span className="text-destructive">{t('stats.voided', { count: voidedCount })}</span>}
                  footer={t('stats.completedOnly')}
                />
                <SummaryValue
                  label={t('stats.average')}
                  value={money.format(averageSatang)}
                  footer={t('stats.vatTotal', { amount: money.format(stats.vatSatang) })}
                />
                <SummaryValue
                  label={t('stats.grossProfit')}
                  value={money.format(stats.profitSatang)}
                  note={<span className="text-success">{t('stats.margin', { percent: marginPercent })}</span>}
                  footer={t('stats.profitNote')}
                />
              </>
            ) : summary.isPending ? (
              <>
                {Array.from({ length: 4 }, (_, index) => <div key={index} aria-hidden className="space-y-2 bg-card p-4"><Skeleton className="h-3 w-20" /><Skeleton className="h-6 w-24" /><Skeleton className="h-3 w-full" /></div>)}
              </>
            ) : null}
            </dl>
          </section>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Panel
            className="rounded-md shadow-none"
            title={t('list.title')}
            description={t('list.description')}
          >
            <div className="overflow-x-auto border-b px-3 py-2">
              <SegmentedTabs
                size="touch"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: t('list.all') },
                  { value: 'completed', label: t('list.completed') },
                  { value: 'voided', label: t('list.voided') },
                ]}
              />
            </div>
            {sales.error && <RetryNotice error={sales.error} stale={!!sales.data} pending={sales.isFetching} onRetry={() => void sales.refetch()} />}
            {(!sales.error || sales.data) && <>
            <DataTable
              rows={visibleSales}
              rowKey={(sale) => sale.id}
              isPending={sales.isPending}
              empty={filter === 'all' ? t('list.empty') : t('list.emptyFiltered')}
              onSelect={(sale) => setSelectedId(sale.id)}
              rowLabel={(sale) => t('list.openReceipt', { receiptNo: sale.receiptNo })}
              columns={[
                { id: 'receiptNo', header: t('columns.receiptNo'), priority: 'primary', className: 'font-medium tabular-nums', cell: (sale) => sale.receiptNo },
                {
                  id: 'time',
                  header: t('columns.time'),
                  priority: 'secondary',
                  className: 'text-muted-foreground tabular-nums',
                  cell: (sale) => date.time(sale.createdAt),
                },
                { id: 'cashier', header: t('columns.cashier'), priority: 'wide-only', cell: (sale) => sale.cashierName },
                {
                  id: 'total',
                  header: t('columns.total'),
                  priority: 'secondary',
                  align: 'right',
                  className: 'font-medium',
                  cell: (sale) => money.plain(sale.totalSatang),
                },
                {
                  id: 'status',
                  header: t('columns.status'),
                  priority: 'secondary',
                  cell: (sale) =>
                    sale.status === 'voided' ? (
                      <StatusBadge tone="danger">{t('list.voided')}</StatusBadge>
                    ) : (
                      <StatusBadge tone="success">{t('list.completed')}</StatusBadge>
                    ),
                },
              ]}
            />
            <PaginationBar {...paging} total={sales.data?.total} isLoading={sales.isFetching} onPageChange={paging.setPage} />
            </>}
          </Panel>

          <div className="space-y-4">
            <Panel
              className="rounded-md shadow-none"
              title={t('attention.title')}
              description={t('attention.description', { count: LOW_STOCK_THRESHOLD })}
              action={
                lowStockCount > 0 && <StatusBadge tone="warning">{tc('items', { count: lowStockCount })}</StatusBadge>
              }
            >
              {products.isPending ? (
                <SkeletonRows rows={3} />
              ) : (
              <ul className="divide-y">
                {lowStock.map((product) => (
                  <li key={product.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border text-muted-foreground">
                      <PackageX className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{product.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{product.sku}</p>
                    </div>
                    <StatusBadge tone={product.stockQty <= 0 ? 'danger' : 'warning'}>
                      {product.stockQty <= 0 ? t('attention.soldOut') : t('attention.left', { count: product.stockQty })}
                    </StatusBadge>
                  </li>
                ))}
                {!products.isPending && !products.error && lowStockCount === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-muted-foreground">{t('attention.allGood')}</li>
                )}
              </ul>
              )}
              {products.error && <RetryNotice error={products.error} stale={!!products.data} pending={products.isFetching} onRetry={() => void products.refetch()} />}
              <PaginationBar {...lowPaging} total={products.data?.total} isLoading={products.isFetching} onPageChange={lowPaging.setPage} />
            </Panel>

            {stats && (
              <Panel className="rounded-md shadow-none" title={t('payments.title')} description={t('payments.description')}>
                <ul className="divide-y">
                  {stats.byMethod.map((row) => (
                    <li key={row.method} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span>{tc(`paymentMethods.${row.method}`)}</span>
                      <span className="font-medium tabular-nums">{money.format(row.amountSatang)}</span>
                    </li>
                  ))}
                  {stats.byMethod.length === 0 && (
                    <li className="px-4 py-6 text-center text-sm text-muted-foreground">{t('payments.empty')}</li>
                  )}
                </ul>
              </Panel>
            )}
          </div>
        </div>
      </div>

      {selectedId !== null && (
        <SaleDetailDialog saleId={selectedId} canVoid={canVoid} onClose={() => setSelectedId(null)} />
      )}
    </>
  )
}
