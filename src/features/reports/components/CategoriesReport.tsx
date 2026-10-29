import type { ReactNode } from 'react'
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
import { categoriesTotalsRow, hasTotals, isTotalRow } from '../lib/report-totals'

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
  // The totals come from the response, so they cover every category and not only this page.
  const rows: (CategoryRow | ReturnType<typeof categoriesTotalsRow>)[] = [
    ...(categories.data?.items ?? []),
    ...(categories.data && hasTotals(categories.data.items.length) ? [categoriesTotalsRow(t('categoriesTotal'), categories.data.totals)] : []),
  ]
  const bold = (row: object, content: ReactNode) => isTotalRow(row) ? <strong className="font-semibold">{content}</strong> : content
  const columns: Column<CategoryRow>[] = [
    { id: 'name', header: t('categoryName'), priority: 'primary', cell: (row) => bold(row, isTotalRow(row) ? row.name : categoryLabel(row, labels)) },
    { id: 'netSales', header: t('netSales'), priority: 'secondary', align: 'right', cell: (row) => bold(row, money.plain(row.netSalesSatang)) },
    { id: 'profit', header: t('profit'), priority: 'secondary', align: 'right', cell: (row) => bold(row, money.plain(row.profitSatang)) },
    { id: 'margin', header: t('margin'), priority: 'secondary', align: 'right', cell: (row) => bold(row, percent(marginBp(row.profitSatang, row.netSalesSatang))) },
    { id: 'share', header: t('share'), priority: 'wide-only', align: 'right', cell: (row) => isTotalRow(row) ? '' : percent(row.shareBp) },
  ]
  return (
    <Panel title={t('categories')}>
      <p className="border-b px-4 py-2 text-xs leading-relaxed text-muted-foreground">{t('categoriesNote')}</p>
      {categories.error ? <div role="alert" className="flex items-center gap-3 p-4 text-sm text-destructive">
        <span>{categories.error.message}</span><Button variant="outline" size="sm" onClick={() => void categories.refetch()}>{t('retry')}</Button>
      </div> : <>
        <DataTable columns={columns} rows={rows} isPending={categories.isPending && enabled}
          rowKey={(row) => isTotalRow(row) ? 'total' : row.categoryId ?? 'none'} empty={t('noCategories')} />
        <PaginationBar page={Math.floor(offset / 10)} pageSize={10} total={categories.data?.total ?? 0} isLoading={categories.isFetching}
          onPageChange={(value) => onPage(value * 10)} />
      </>}
    </Panel>
  )
}
