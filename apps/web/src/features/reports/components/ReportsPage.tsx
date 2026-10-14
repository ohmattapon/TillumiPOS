import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { Download, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useActiveBranch } from '@/features/branches'
import { settingsQuery, useFormat, useSettings } from '@/features/settings'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { reportQuery, productsReportQuery, branchesReportQuery, readReport, readProducts, readBranches } from '../api'
import { validRange, todayInTimeZone, type ReportFilters as Filters } from '../lib/date-range'
import { collectPages } from '../lib/collect-pages'
import { ReportFilters } from './ReportFilters'
import { ReportDataTable, ReportPagination } from './ReportDataTable'
import { DailySalesChart } from './DailySalesChart'

export function ReportsPage() {
  const { t } = useTranslation('reports')
  const { t: tc } = useTranslation()
  const shop = useSettings()
  const settings = useQuery(settingsQuery)
  const { money, currency, locale } = useFormat()
  const { branch } = useActiveBranch()
  const [params, setParams] = useSearchParams()
  const [exporting, setExporting] = useState(false)
  const today = todayInTimeZone(shop.timeZone)
  const filters: Filters = {
    from: params.get('from') ?? today.slice(0, 7) + '-01',
    to: params.get('to') ?? today,
    scope: params.get('scope') === 'all' ? 'all' : 'branch',
  }
  const offset = (name: string) => {
    const value = Number(params.get(name) ?? 0)
    return Number.isSafeInteger(value) && value >= 0 && value <= 1000000 ? value : 0
  }
  const productOffset = offset('products')
  const branchOffset = offset('branches')
  const enabled = Boolean(branch) && Boolean(settings.data) && validRange(filters.from, filters.to)
  const branchId = branch?.id ?? 0
  const report = useQuery({ ...reportQuery(filters, branchId), enabled })
  const products = useQuery({ ...productsReportQuery(filters, branchId, productOffset), enabled })
  const branches = useQuery({ ...branchesReportQuery(filters, branchId, branchOffset), enabled })
  const summary = report.data?.summary
  const setPage = (name: string, value: number) => {
    const next = new URLSearchParams(params)
    next.set(name, String(value))
    setParams(next)
  }
  const exportExcel = async () => {
    if (!branch || exporting || !enabled) return
    setExporting(true)
    try {
      // Pin the branch header for the whole export, even if the sidebar changes mid-download.
      const [fresh, allProducts, allBranches, { downloadReportWorkbook }] = await Promise.all([
        readReport(filters, branch.id),
        collectPages((offset, limit) => readProducts(filters, branch.id, offset, limit)),
        collectPages((offset, limit) => readBranches(filters, branch.id, offset, limit)),
        import('../lib/export-workbook'),
      ])
      if (new Set(allProducts.map((row) => row.productId)).size !== allProducts.length
        || new Set(allBranches.map((row) => row.branchId)).size !== allBranches.length) throw new Error('REPORT_CHANGED')
      await downloadReportWorkbook({
        report: fresh, products: allProducts, branches: allBranches,
        branchName: filters.scope === 'all' ? t('allBranches') : branch.name,
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
  const day = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })
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
        <ReportFilters key={`${filters.from}-${filters.to}-${filters.scope}-${shop.timeZone}-${branchId}`}
          filters={filters} today={today} branchName={branch?.name ?? t('scope')}
          onApply={(next) => setParams({ ...next })} />
        <p className="text-xs text-muted-foreground">{t('zone', { zone: report.data?.timeZone ?? shop.timeZone })} · {currency}</p>
        {failure(settings.error, () => void settings.refetch())}
        {!validRange(filters.from, filters.to) ? <p role="alert" className="text-sm text-destructive">{t('invalidRange')}</p> : <>
          {failure(report.error, () => void report.refetch())}
          {summary ? <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('summarySheet')}>
              {[
                { title: t('revenue'), value: money.format(summary.totalSatang), note: t('revenueNote') },
                { title: t('bills'), value: summary.saleCount.toLocaleString(), note: t('voids', { count: summary.voidedCount }) },
                { title: t('profit'), value: money.format(summary.profitSatang), note: t('profitNote') },
                { title: t('average'), value: money.format(summary.saleCount ? Math.round(summary.totalSatang / summary.saleCount) : 0), note: t('revenueNote') },
              ].map((stat) => <div key={stat.title} className="rounded-xl border bg-card p-4 shadow-xs">
                <p className="text-xs text-muted-foreground">{stat.title}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{stat.value}</p>
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
                  rows={report.data.days.items.map((row) => [day.format(new Date(row.day)), row.saleCount, money.plain(row.totalSatang), money.plain(row.profitSatang)])} />
              </> : <Skeleton className="m-4 h-48" />}
            </Panel>
            <Panel title={t('methods')} description={t('methodNote')}>
              <div className="divide-y px-4">
                {report.data?.byMethod.map((row) => <div key={row.method} className="flex justify-between gap-3 py-4 text-sm">
                  <span>{tc(`paymentMethods.${row.method}`)}</span><strong className="tabular-nums">{money.format(row.amountSatang)}</strong>
                </div>)}
              </div>
            </Panel>
          </div>
          <Panel title={t('products')}>
            <p className="border-b px-4 py-2 text-xs leading-relaxed text-muted-foreground">{t('productsNote')}</p>
            {failure(products.error, () => void products.refetch())}
            {products.isPending ? <Skeleton className="m-4 h-24" /> : !products.error && <>
              <ReportDataTable headers={[t('sku'), t('product'), t('quantity'), t('itemSales')]} numberFrom={2}
                rows={(products.data?.items ?? []).map((row) => [row.sku, row.productName, row.quantity, money.plain(row.lineTotalSatang)])} />
              <ReportPagination offset={productOffset} total={products.data?.total ?? 0} disabled={products.isFetching} onPage={(value) => setPage('products', value)} />
            </>}
          </Panel>
          <Panel title={t('branches')} description={t('branchesNote')}>
            {failure(branches.error, () => void branches.refetch())}
            {branches.isPending ? <Skeleton className="m-4 h-24" /> : !branches.error && <>
              <ReportDataTable headers={[t('branch'), t('bills'), t('revenue'), t('profit')]}
                rows={(branches.data?.items ?? []).map((row) => [row.branchName, row.saleCount, money.plain(row.totalSatang), money.plain(row.profitSatang)])} />
              <ReportPagination offset={branchOffset} total={branches.data?.total ?? 0} disabled={branches.isFetching} onPage={(value) => setPage('branches', value)} />
            </>}
          </Panel>
          <p className="pb-2 text-xs leading-relaxed text-muted-foreground">{t('basis')}</p>
        </>}
      </main>
    </>
  )
}
