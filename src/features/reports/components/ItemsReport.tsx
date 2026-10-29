import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Panel } from '@/components/Panel'
import { DataTable } from '@/components/DataTable'
import { PaginationBar } from '@/components/PaginationBar'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { categoriesQuery } from '@/features/categories'
import { useFormat } from '@/features/settings'
import type { Column } from '@/lib/data-table'
import { itemsReportQuery } from '../api'
import type { ReportFilters } from '../lib/date-range'
import { formatBasisPoints, marginBp } from '../lib/report-format'
import { REPORT_ITEM_SORTS, type ReportItemSort } from '../lib/report-search-params'

type ItemRow = NonNullable<ReturnType<typeof useItemRows>['data']>['items'][number]
const useItemRows = (...args: Parameters<typeof itemsReportQuery>) => useQuery(itemsReportQuery(...args))

const SORT_LABEL = { quantity: 'sortQuantity', sales: 'sortSales', profit: 'sortProfit', margin: 'sortMargin' } as const

export function ItemsReport({ filters, categoryId, sort, offset, enabled, onCategory, onSort, onPage }: {
  filters: ReportFilters
  categoryId: number | 'none' | undefined
  sort: ReportItemSort
  offset: number
  enabled: boolean
  onCategory: (categoryId: number | 'none' | undefined) => void
  onSort: (sort: ReportItemSort) => void
  onPage: (offset: number) => void
}) {
  const { t } = useTranslation('reports')
  const { money } = useFormat()
  const categories = useQuery(categoriesQuery)
  const items = useQuery({ ...itemsReportQuery(filters, { categoryId, sort }, offset), enabled })
  const columns: Column<ItemRow>[] = [
    { id: 'product', header: t('product'), priority: 'primary', cell: (row) => row.productName },
    { id: 'pack', header: t('pack'), priority: 'secondary', cell: (row) => row.packSize > 1 ? t('packOf', { size: row.packSize }) : t('singlePiece') },
    { id: 'quantity', header: t('quantity'), priority: 'secondary', align: 'right', cell: (row) => row.quantity.toLocaleString() },
    { id: 'netSales', header: t('netSales'), priority: 'secondary', align: 'right', cell: (row) => money.plain(row.netSalesSatang) },
    { id: 'cost', header: t('cost'), priority: 'wide-only', align: 'right', cell: (row) => money.plain(row.costSatang) },
    { id: 'profit', header: t('profit'), priority: 'secondary', align: 'right', cell: (row) => money.plain(row.profitSatang) },
    {
      id: 'margin', header: t('margin'), priority: 'wide-only', align: 'right',
      cell: (row) => {
        const margin = marginBp(row.profitSatang, row.netSalesSatang)
        return margin === null ? '—' : `${margin < 0 ? '−' : ''}${formatBasisPoints(margin)}`
      },
    },
  ]
  // The sort sits in the toolbar rather than in the column headers: the headers are hidden on a phone.
  const toolbar = <>
    <Select value={categoryId === undefined ? 'all' : String(categoryId)}
      onValueChange={(value) => onCategory(value === 'all' ? undefined : value === 'none' ? 'none' : Number(value))}>
      <SelectTrigger className="h-11 w-48" aria-label={t('category')}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="all">{t('allCategories')}</SelectItem>
          <SelectItem value="none">{t('noCategory')}</SelectItem>
          {(categories.data ?? []).map((category) => <SelectItem key={category.id} value={String(category.id)}>{category.name}</SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
    <Select value={sort} onValueChange={(value) => onSort(value as ReportItemSort)}>
      <SelectTrigger className="h-11 w-48" aria-label={t('sortBy')}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {REPORT_ITEM_SORTS.map((name) => <SelectItem key={name} value={name}>{t('sortBy')} {t(SORT_LABEL[name])}</SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  </>
  return (
    <Panel title={t('items')}>
      <p className="border-b px-4 py-2 text-xs leading-relaxed text-muted-foreground">{t('itemsNote')}</p>
      {items.error ? <div role="alert" className="flex items-center gap-3 p-4 text-sm text-destructive">
        <span>{items.error.message}</span><Button variant="outline" size="sm" onClick={() => void items.refetch()}>{t('retry')}</Button>
      </div> : <>
        <DataTable columns={columns} rows={items.data?.items ?? []} isPending={items.isPending && enabled} toolbar={toolbar}
          rowKey={(row) => `${row.productId}-${row.packSize}`} empty={t('noItems')} />
        <PaginationBar page={Math.floor(offset / 10)} pageSize={10} total={items.data?.total ?? 0} isLoading={items.isFetching}
          onPageChange={(value) => onPage(value * 10)} />
      </>}
    </Panel>
  )
}
