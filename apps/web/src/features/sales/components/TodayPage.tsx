import { useQuery } from '@tanstack/react-query'
import { Banknote, PackageX, Receipt as ReceiptIcon, ShoppingCart, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Panel'
import { DataTable } from '@/components/DataTable'
import { SaleDetailDialog } from './SaleDetailDialog'
import { SegmentedTabs } from '@/components/SegmentedTabs'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { isLowStock, LOW_STOCK_THRESHOLD, productsQuery } from '@/features/products'
import { useFormat } from '@/features/settings'
import { salesTodayQuery, summaryTodayQuery } from '../api'

type StatusFilter = 'all' | 'completed' | 'voided'

interface StatProps {
  icon: LucideIcon
  label: string
  value: string
  note?: ReactNode
  footer: string
}

function StatCard({ icon: Icon, label, value, note, footer }: StatProps) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex size-6 items-center justify-center rounded-md border">
          <Icon className="size-3.5" />
        </span>
        {label}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        <span className="text-xs">{note}</span>
      </div>
      <p className="mt-3 border-t pt-2.5 text-xs text-muted-foreground">{footer}</p>
    </div>
  )
}

export function TodayPage({ isOwner }: { isOwner: boolean }) {
  const { t } = useTranslation('sales')
  const { t: tc } = useTranslation()
  const { money, date } = useFormat()
  const sales = useQuery(salesTodayQuery)
  const summary = useQuery({ ...summaryTodayQuery, enabled: isOwner })
  const products = useQuery(productsQuery())

  const [filter, setFilter] = useState<StatusFilter>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [today] = useState(() => new Date())

  const allSales = sales.data ?? []
  const voidedCount = allSales.filter((sale) => sale.status === 'voided').length
  const visibleSales = filter === 'all' ? allSales : allSales.filter((sale) => sale.status === filter)
  const lowStock = (products.data ?? [])
    .filter(isLowStock)
    .sort((a, b) => a.stockQty - b.stockQty)

  const stats = summary.data
  const averageSatang = stats && stats.saleCount > 0 ? Math.round(stats.totalSatang / stats.saleCount) : 0
  const marginPercent = stats && stats.totalSatang > 0 ? Math.round((stats.profitSatang / stats.totalSatang) * 100) : 0

  return (
    <>
      <PageHeader
        title={t('today.title')}
        highlight={date.longDate(today)}
        description={t('today.summary', { count: allSales.length, voided: voidedCount })}
      >
        {lowStock.length > 0 && (
          <StatusBadge tone="warning" className="hidden h-7 px-3 sm:inline-flex">
            {t('today.lowStockBadge', { items: tc('items', { count: lowStock.length }) })}
          </StatusBadge>
        )}
        <Button asChild className="h-9 px-3">
          <Link to="/">
            <ShoppingCart />
            {t('today.openPos')}
          </Link>
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {isOwner && (
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {stats ? (
              <>
                <StatCard
                  icon={Banknote}
                  label={t('stats.netSales')}
                  value={money.format(stats.totalSatang)}
                  footer={t('stats.totalDiscount', { amount: money.format(stats.discountSatang) })}
                />
                <StatCard
                  icon={ReceiptIcon}
                  label={t('stats.saleCount')}
                  value={String(stats.saleCount)}
                  note={voidedCount > 0 && <span className="text-destructive">{t('stats.voided', { count: voidedCount })}</span>}
                  footer={t('stats.completedOnly')}
                />
                <StatCard
                  icon={Wallet}
                  label={t('stats.average')}
                  value={money.format(averageSatang)}
                  footer={t('stats.vatTotal', { amount: money.format(stats.vatSatang) })}
                />
                <StatCard
                  icon={TrendingUp}
                  label={t('stats.grossProfit')}
                  value={money.format(stats.profitSatang)}
                  note={<span className="text-success">{t('stats.margin', { percent: marginPercent })}</span>}
                  footer={t('stats.profitNote')}
                />
              </>
            ) : (
              Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-30 rounded-xl" />)
            )}
          </div>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Panel
            title={t('list.title')}
            description={t('list.description')}
            action={
              <SegmentedTabs
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: t('list.all') },
                  { value: 'completed', label: t('list.completed') },
                  { value: 'voided', label: t('list.voided') },
                ]}
              />
            }
          >
            {sales.error && <p className="p-4 text-sm text-destructive">{sales.error.message}</p>}
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
          </Panel>

          <div className="space-y-4">
            <Panel
              title={t('attention.title')}
              description={t('attention.description', { count: LOW_STOCK_THRESHOLD })}
              action={
                lowStock.length > 0 && <StatusBadge tone="warning">{tc('items', { count: lowStock.length })}</StatusBadge>
              }
            >
              <ul className="divide-y">
                {lowStock.slice(0, 8).map((product) => (
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
                {lowStock.length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-muted-foreground">{t('attention.allGood')}</li>
                )}
              </ul>
            </Panel>

            {stats && (
              <Panel title={t('payments.title')} description={t('payments.description')}>
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
        <SaleDetailDialog saleId={selectedId} canVoid={isOwner} onClose={() => setSelectedId(null)} />
      )}
    </>
  )
}
