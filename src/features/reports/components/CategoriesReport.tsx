import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Panel } from '@/components/Panel'
import { DataTable } from '@/components/DataTable'
import { PaginationBar } from '@/components/PaginationBar'
import { Button } from '@/components/ui/button'
import { useFormat } from '@/features/settings'
import type { Column } from '@/lib/data-table'
import { categoriesReportQuery } from '../api'
import type { ReportFilters } from '../lib/date-range'
import { categoryLabel, formatBasisPoints, marginBp } from '../lib/report-format'

type CategoryRow = NonNullable<ReturnType<typeof useCategoryRows>['data']>['items'][number]
const useCategoryRows = (...args: Parameters<typeof categoriesReportQuery>) => useQuery(categoriesReportQuery(...args))

const percent = (bp: number | null) => bp === null ? '—' : `${bp < 0 ? '−' : ''}${formatBasisPoints(bp)}`

export function CategoriesReport({ filters, offset, enabled, onPage }: {
  filters: ReportFilters; offset: number; enabled: boolean; onPage: (offset: number) => void
}) {
  const { t } = useTranslation('reports')
  const { money } = useFormat()
  const categories = useQuery({ ...categoriesReportQuery(filters, offset), enabled })
  const labels = { none: t('noCategory'), deleted: t('deletedCategory') }
  const columns: Column<CategoryRow>[] = [
    { id: 'name', header: t('categoryName'), priority: 'primary', cell: (row) => categoryLabel(row, labels) },
    { id: 'netSales', header: t('netSales'), priority: 'secondary', align: 'right', cell: (row) => money.plain(row.netSalesSatang) },
    { id: 'profit', header: t('profit'), priority: 'secondary', align: 'right', cell: (row) => money.plain(row.profitSatang) },
    { id: 'margin', header: t('margin'), priority: 'secondary', align: 'right', cell: (row) => percent(marginBp(row.profitSatang, row.netSalesSatang)) },
    { id: 'share', header: t('share'), priority: 'wide-only', align: 'right', cell: (row) => percent(row.shareBp) },
  ]
  return (
    <Panel title={t('categories')}>
      <p className="border-b px-4 py-2 text-xs leading-relaxed text-muted-foreground">{t('categoriesNote')}</p>
      {categories.error ? <div role="alert" className="flex items-center gap-3 p-4 text-sm text-destructive">
        <span>{categories.error.message}</span><Button variant="outline" size="sm" onClick={() => void categories.refetch()}>{t('retry')}</Button>
      </div> : <>
        <DataTable columns={columns} rows={categories.data?.items ?? []} isPending={categories.isPending && enabled}
          rowKey={(row) => row.categoryId ?? 'none'} empty={t('noCategories')} />
        <PaginationBar page={Math.floor(offset / 10)} pageSize={10} total={categories.data?.total ?? 0} isLoading={categories.isFetching}
          onPageChange={(value) => onPage(value * 10)} />
      </>}
    </Panel>
  )
}
