import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { Download, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { categoriesQuery } from '@/features/categories'
import { settingsQuery, useFormat, useSettings } from '@/features/settings'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Panel'
import { SegmentedTabs } from '@/components/SegmentedTabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { dailyTotalsCells, hasTotals } from '../lib/report-totals'
import { promotionTotalsCells, hasPromotionTotals } from '../lib/promotion-totals'
import { reportQuery, productsReportQuery, promotionsReportQuery, cashiersReportQuery, readReport, readItems, readCategories, readPromotions } from '../api'
import { validRange } from '../lib/date-range'
import { readReportSearch, writeReportSearch, type ReportSearch, type ReportTab } from '../lib/report-search-params'
import { collectPagesWith } from '../lib/collect-pages'
import { ReportFilters } from './ReportFilters'
import { ReportDataTable } from './ReportDataTable'
import { PaginationBar } from '@/components/PaginationBar'
import { todayIn } from '@/lib/calendar-date'
import { DailySalesChart } from './DailySalesChart'
import { ChangeNote } from './ChangeNote'
import { ItemsReport } from './ItemsReport'
import { CategoriesReport } from './CategoriesReport'
import { UnallocatedNote } from './UnallocatedNote'

export function ReportsPage() {
  const { t } = useTranslation('reports')
  const { t: tc } = useTranslation()
  const shop = useSettings()
  const settings = useQuery(settingsQuery)
  const { money, count, currency, locale, date } = useFormat()
  const [params, setParams] = useSearchParams()
  const [exporting, setExporting] = useState(false)
  const today = todayIn(shop.timeZone)
  const search = readReportSearch(params, today)
  const { tab } = search
  // The filters are the URL minus the tab, the sort and the category, which only the tabs read.
  const filters = { from: search.from, to: search.to, cashierId: search.cashierId, customer: search.customer, compare: search.compare }
  const go = (next: ReportSearch) => setParams(writeReportSearch(next))
  const offset = (name: string) => {
    const value = Number(params.get(name) ?? 0)
    return Number.isSafeInteger(value) && value >= 0 && value <= 1000000 ? value : 0
  }
  const productOffset = offset('products')
  const promotionOffset = offset('promotions')
  const itemOffset = offset('items')
  const categoryOffset = offset('categories')
  const enabled = Boolean(settings.data) && validRange(filters.from, filters.to)
  const report = useQuery({ ...reportQuery(filters), enabled })
  // Only the overview tab lists best sellers, so the other tabs do not fetch them.
  const products = useQuery({ ...productsReportQuery(filters, productOffset), enabled: enabled && tab === 'overview' })
  const promotions = useQuery({ ...promotionsReportQuery(filters, promotionOffset), enabled: enabled && tab === 'promotions' })
  const cashiers = useQuery({ ...cashiersReportQuery({ from: filters.from, to: filters.to }), enabled })
  const categoryList = useQuery(categoriesQuery)
  const summary = report.data?.summary
  const previous = report.data?.previous
  const average = (sums: { totalSatang: number; saleCount: number }) => sums.saleCount ? Math.round(sums.totalSatang / sums.saleCount) : 0
  const setPage = (name: string, value: number) => {
    const next = new URLSearchParams(params)
    next.set(name, String(value))
    setParams(next)
  }
  const exportExcel = async () => {
    if (exporting || !enabled) return
    setExporting(true)
    try {
      const itemOptions = { categoryId: tab === 'items' ? search.categoryId : undefined, sort: search.sort }
      const [fresh, items, categories, promotions, { downloadReportWorkbook }] = await Promise.all([
        readReport(filters),
        collectPagesWith((pageOffset, limit) => readItems(filters, itemOptions, pageOffset, limit), (page) => page.totals),
        collectPagesWith((pageOffset, limit) => readCategories(filters, pageOffset, limit), (page) => page.totals),
        collectPagesWith((pageOffset, limit) => readPromotions(filters, pageOffset, limit), (page) => ({ totals: page.totals, completedBills: page.completedBills })),
        import('../lib/export-workbook'),
      ])
      if (new Set(items.items.map((row) => `${row.productId}-${row.packSize}`)).size !== items.items.length) throw new Error('REPORT_CHANGED')
      if (new Set(categories.items.map((row) => row.categoryId)).size !== categories.items.length) throw new Error('REPORT_CHANGED')
      if (new Set(promotions.items.map((row) => row.promotionId)).size !== promotions.items.length) throw new Error('REPORT_CHANGED')
      const cashierName = filters.cashierId === undefined ? undefined
        : cashiers.data?.items.find((row) => row.cashierId === filters.cashierId)?.cashierName ?? t('unknownCashier', { id: filters.cashierId })
      const categoryName = itemOptions.categoryId === undefined ? undefined
        : itemOptions.categoryId === 'none' ? t('noCategory')
          : categoryList.data?.find((row) => row.id === itemOptions.categoryId)?.name ?? t('deletedCategory')
      await downloadReportWorkbook({
        report: fresh, items: items.items, itemTotals: items.extra,
        categories: categories.items, categoryTotals: categories.extra,
        promotions: promotions.items, promotionTotals: promotions.extra.totals, completedBills: promotions.extra.completedBills,
        filters: { cashierName, customer: filters.customer, categoryName },
        currency, fractionDigits: money.fractionDigits, locale,
      })
      toast.success(t('exported'))
    } catch (error) {
      console.error('Sales report export failed:', error)
      toast.error(error instanceof Error && error.message === 'REPORT_CHANGED' ? t('changed')
        : error instanceof Error && error.message === 'REPORT_TOO_LARGE' ? t('tooLarge') : t('exportFailed'))
    } finally { setExporting(false) }
  }
  const failure = (error: Error | null, retry: () => void) => error ? <div role="alert" className="flex items-center gap-3 p-4 text-sm text-destructive">
    <span>{error.message}</span><Button variant="outline" size="sm" onClick={retry}>{t('retry')}</Button>
  </div> : null
  return (
    <>
      <PageHeader title={t('title')} description={t('description')}>
        <Button variant="outline" disabled={!report.data || !enabled || exporting} onClick={() => void exportExcel()}>
          {exporting ? <LoaderCircle className="animate-spin" /> : <Download />}
          <span className="hidden sm:inline">{exporting ? t('exporting') : t('export')}</span>
          <span className="sr-only sm:hidden">{t('export')}</span>
        </Button>
      </PageHeader>
      <main className="flex-1 space-y-4 overflow-y-auto p-4">
        <ReportFilters key={`${filters.from}-${filters.to}-${filters.cashierId}-${filters.customer}-${filters.compare}-${shop.timeZone}`}
          filters={filters} today={today}
          onApply={(next) => go({ ...search, ...next })} />
        <p className="text-xs text-muted-foreground">{t('zone', { zone: report.data?.timeZone ?? shop.timeZone })}, {currency}</p>
        {failure(settings.error, () => void settings.refetch())}
        {!validRange(filters.from, filters.to) ? <p role="alert" className="text-sm text-destructive">{t('invalidRange')}</p> : <>
          {failure(report.error, () => void report.refetch())}
          <SegmentedTabs<ReportTab> value={tab} onChange={(next) => go({ ...search, tab: next })} className="max-w-full overflow-x-auto"
            options={[
              { value: 'overview', label: t('tabOverview') }, { value: 'items', label: t('tabItems') },
              { value: 'categories', label: t('tabCategories') }, { value: 'promotions', label: t('tabPromotions') },
            ]} />
          {tab === 'items' || tab === 'categories' ? <UnallocatedNote lines={report.data?.unallocatedLines ?? 0} format={count} /> : null}
          {tab === 'items' ? <ItemsReport filters={filters} categoryId={search.categoryId} sort={search.sort} offset={itemOffset} enabled={enabled}
            onCategory={(categoryId) => go({ ...search, categoryId })} onSort={(sort) => go({ ...search, sort })}
            onPage={(value) => setPage('items', value)} />
          : tab === 'categories' ? <CategoriesReport filters={filters} offset={categoryOffset} enabled={enabled}
            onPage={(value) => setPage('categories', value)} />
          : tab === 'overview' ? <>
          {summary ? <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('summarySheet')}>
              {[
                { title: t('revenue'), current: summary.totalSatang, before: previous?.totalSatang, shown: money.format, note: t('revenueNote') },
                { title: t('bills'), current: summary.saleCount, before: previous?.saleCount, shown: count, note: t('voids', { count: summary.voidedCount }) },
                { title: t('profit'), current: summary.profitSatang, before: previous?.profitSatang, shown: money.format, note: t('profitNote') },
                { title: t('average'), current: average(summary), before: previous && average(previous), shown: money.format, note: t('revenueNote') },
              ].map((stat) => <div key={stat.title} className="rounded-[10px] border bg-card p-4">
                <p className="text-xs text-muted-foreground">{stat.title}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{stat.shown(stat.current)}</p>
                <ChangeNote current={stat.current} previous={stat.before} previousText={stat.before === undefined ? '' : stat.shown(stat.before)} />
                <p className="mt-2 text-xs text-muted-foreground">{stat.note}</p>
              </div>)}
            </section>
            <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-muted px-4 py-3 text-xs">
              {[['netSales', summary.netSalesSatang], ['cost', summary.costSatang], ['vat', summary.vatSatang], ['discount', summary.discountSatang]].map(([key, value]) =>
                <span key={key}>{t(key as 'netSales')} <strong className="ml-1 tabular-nums">{money.format(Number(value))}</strong></span>)}
            </div>
            {summary.saleCount === 0 && summary.voidedCount === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t('empty')}</p>}
          </> : !report.error && <div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>}
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <Panel title={t('daily')} description={t('dailyNote')}>
              {report.data ? <>
                <DailySalesChart days={report.data.days.items} />
                <ReportDataTable headers={[t('day'), t('bills'), t('revenue'), t('profit')]}
                  rows={report.data.days.items.map((row) => [date.calendarDateShortYear(row.day), row.saleCount, money.plain(row.totalSatang), money.plain(row.profitSatang)])}
                  footer={hasTotals(report.data.days.items.length) ? dailyTotalsCells(t('dailyTotal'), report.data.summary, money.plain) : undefined} />
              </> : <Skeleton className="m-4 h-48" />}
            </Panel>
            <Panel title={t('methods')} description={t('methodNote')}>
              <div className="divide-y px-4">
                {report.data?.byMethod.map((row) => <div key={row.method} className="flex justify-between gap-3 py-4 text-sm">
                  <span>{tc(`paymentMethods.${row.method}`)}</span><strong className="tabular-nums">{money.format(row.amountSatang)}</strong>
                </div>)}
                {report.data && <div className="flex justify-between gap-3 py-4 text-sm font-semibold">
                  <span>{t('methodsTotal')}</span><strong className="tabular-nums">{money.format(report.data.summary.totalSatang)}</strong>
                </div>}
              </div>
            </Panel>
          </div>
          <Panel title={t('products')}>
            <p className="border-b px-4 py-2 text-xs leading-relaxed text-muted-foreground">{t('productsNote')}</p>
            {failure(products.error, () => void products.refetch())}
            {products.isPending ? <Skeleton className="m-4 h-24" /> : !products.error && <>
              <ReportDataTable headers={[t('sku'), t('product'), t('quantity'), t('itemSales')]} numberFrom={2}
                rows={(products.data?.items ?? []).map((row) => [row.sku, row.productName, row.quantity, money.plain(row.lineTotalSatang)])} />
              <PaginationBar page={Math.floor(productOffset / 10)} pageSize={10} total={products.data?.total ?? 0} isLoading={products.isFetching} onPageChange={(value) => setPage('products', value * 10)} />
            </>}
          </Panel>
          <p className="pb-2 text-xs leading-relaxed text-muted-foreground">{t('basis')}</p>
          </> : <Panel title={t('promotions')}>
            <p className="border-b px-4 py-2 text-xs leading-relaxed text-muted-foreground">{t('promotionsNote')}</p>
            {failure(promotions.error, () => void promotions.refetch())}
            {promotions.isPending ? <Skeleton className="m-4 h-24" /> : !promotions.error && ((promotions.data?.items ?? []).length > 0 ? <>
              <p className="border-b px-4 py-2 text-sm">{t('promotionUsage', { used: count(promotions.data?.totals.bills ?? 0), all: count(promotions.data?.completedBills ?? 0) })}</p>
              <ReportDataTable headers={[t('promotionName'), t('promotionBills'), t('promotionDiscount'), t('promotionNetSales')]} numberFrom={1}
                rows={(promotions.data?.items ?? []).map((row) => [row.name, row.bills, money.plain(row.discountSatang), money.plain(row.netSalesSatang)])}
                footer={promotions.data && hasPromotionTotals(promotions.data.items.length) ? promotionTotalsCells(t('promotionTotal'), promotions.data.totals, money.plain) : undefined} />
              <PaginationBar page={Math.floor(promotionOffset / 10)} pageSize={10} total={promotions.data?.total ?? 0} isLoading={promotions.isFetching} onPageChange={(value) => setPage('promotions', value * 10)} />
            </> : <p className="px-4 py-6 text-sm text-muted-foreground">{t('noPromotions')}</p>)}
          </Panel>}
        </>}
      </main>
    </>
  )
}
