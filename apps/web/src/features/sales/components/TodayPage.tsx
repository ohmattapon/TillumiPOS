import { useQuery } from '@tanstack/react-query'
import { Banknote, PackageX, Receipt as ReceiptIcon, ShoppingCart, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Panel, tableCell, tableHead } from '@/components/Panel'
import { SaleDetailDialog } from './SaleDetailDialog'
import { SegmentedTabs } from '@/components/SegmentedTabs'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatBaht, formatLongDate, formatTime, paymentMethodLabel } from '@/lib/money'
import { isLowStock, LOW_STOCK_THRESHOLD, productsQuery } from '@/features/products'
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
        title="วันนี้"
        highlight={formatLongDate(today)}
        description={`${allSales.length} บิล · ยกเลิก ${voidedCount} บิล`}
      >
        {lowStock.length > 0 && (
          <StatusBadge tone="warning" className="hidden h-7 px-3 sm:inline-flex">
            สินค้าใกล้หมด {lowStock.length} รายการ
          </StatusBadge>
        )}
        <Button asChild className="h-9 px-3">
          <Link to="/">
            <ShoppingCart />
            เปิดหน้าขาย
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
                  label="ยอดขายสุทธิ · วันนี้"
                  value={`฿${formatBaht(stats.totalSatang)}`}
                  footer={`ส่วนลดรวม ฿${formatBaht(stats.discountSatang)}`}
                />
                <StatCard
                  icon={ReceiptIcon}
                  label="จำนวนบิล"
                  value={String(stats.saleCount)}
                  note={voidedCount > 0 && <span className="text-destructive">ยกเลิก {voidedCount}</span>}
                  footer="นับเฉพาะบิลที่สำเร็จ"
                />
                <StatCard
                  icon={Wallet}
                  label="เฉลี่ยต่อบิล"
                  value={`฿${formatBaht(averageSatang)}`}
                  footer={`VAT ที่รวมอยู่ ฿${formatBaht(stats.vatSatang)}`}
                />
                <StatCard
                  icon={TrendingUp}
                  label="กำไรขั้นต้น"
                  value={`฿${formatBaht(stats.profitSatang)}`}
                  note={<span className="text-success">{marginPercent}% ของยอดขาย</span>}
                  footer="ยอดขายหลังส่วนลด ลบต้นทุนสินค้า"
                />
              </>
            ) : (
              Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-30 rounded-xl" />)
            )}
          </div>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Panel
            title="บิลขายวันนี้"
            description="แตะที่บิลเพื่อดูรายละเอียด พิมพ์ซ้ำ หรือยกเลิก"
            action={
              <SegmentedTabs
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'ทั้งหมด' },
                  { value: 'completed', label: 'สำเร็จ' },
                  { value: 'voided', label: 'ยกเลิก' },
                ]}
              />
            }
          >
            {sales.error && <p className="p-4 text-sm text-destructive">{sales.error.message}</p>}
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={tableHead}>เลขที่</TableHead>
                  <TableHead className={tableHead}>เวลา</TableHead>
                  <TableHead className={tableHead}>พนักงาน</TableHead>
                  <TableHead className={`${tableHead} text-right`}>ยอดสุทธิ</TableHead>
                  <TableHead className={tableHead}>สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSales.map((sale) => (
                  <TableRow
                    key={sale.id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(sale.id)}
                    onKeyDown={(event) => event.key === 'Enter' && setSelectedId(sale.id)}
                  >
                    <TableCell className={`${tableCell} font-medium tabular-nums`}>{sale.receiptNo}</TableCell>
                    <TableCell className={`${tableCell} text-muted-foreground tabular-nums`}>
                      {formatTime(sale.createdAt)}
                    </TableCell>
                    <TableCell className={tableCell}>{sale.cashierName}</TableCell>
                    <TableCell className={`${tableCell} text-right font-medium tabular-nums`}>
                      {formatBaht(sale.totalSatang)}
                    </TableCell>
                    <TableCell className={tableCell}>
                      {sale.status === 'voided' ? (
                        <StatusBadge tone="danger">ยกเลิก</StatusBadge>
                      ) : (
                        <StatusBadge tone="success">สำเร็จ</StatusBadge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!sales.isPending && visibleSales.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      {filter === 'all' ? 'วันนี้ยังไม่มีบิลขาย' : 'ไม่มีบิลในสถานะนี้'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Panel>

          <div className="space-y-4">
            <Panel
              title="ต้องดูแล"
              description={`สินค้าที่เหลือไม่เกิน ${LOW_STOCK_THRESHOLD} ชิ้น`}
              action={lowStock.length > 0 && <StatusBadge tone="warning">{lowStock.length} รายการ</StatusBadge>}
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
                      {product.stockQty <= 0 ? 'หมด' : `เหลือ ${product.stockQty}`}
                    </StatusBadge>
                  </li>
                ))}
                {lowStock.length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-muted-foreground">สต็อกทุกรายการยังเพียงพอ</li>
                )}
              </ul>
            </Panel>

            {stats && (
              <Panel title="รับชำระวันนี้" description="เงินสดหักเงินทอนแล้ว">
                <ul className="divide-y">
                  {stats.byMethod.map((row) => (
                    <li key={row.method} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span>{paymentMethodLabel[row.method]}</span>
                      <span className="font-medium tabular-nums">฿{formatBaht(row.amountSatang)}</span>
                    </li>
                  ))}
                  {stats.byMethod.length === 0 && (
                    <li className="px-4 py-6 text-center text-sm text-muted-foreground">ยังไม่มีการรับชำระ</li>
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
