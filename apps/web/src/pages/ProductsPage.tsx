import type { Product } from '@pos/api/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal, PackagePlus, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Panel, tableCell, tableHead } from '@/components/Panel'
import { ProductFormDialog } from '@/components/ProductFormDialog'
import { ProductImage } from '@/components/ProductImage'
import { SegmentedTabs } from '@/components/SegmentedTabs'
import { StatusBadge } from '@/components/StatusBadge'
import { StockDialog, type StockMode } from '@/components/StockDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api, unwrap } from '@/lib/api'
import { formatBaht } from '@/lib/money'
import { categoriesQuery, LOW_STOCK_THRESHOLD, productsQuery } from '@/lib/queries'

type Filter = 'all' | 'low' | 'inactive'

type OpenDialog = { kind: 'form'; product?: Product } | { kind: 'stock'; product: Product; mode: StockMode } | null

const isLowStock = (product: Product) => product.trackStock && product.stockQty <= LOW_STOCK_THRESHOLD

export function ProductsPage() {
  const queryClient = useQueryClient()
  const products = useQuery(productsQuery(true))
  const categories = useQuery(categoriesQuery)

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<OpenDialog>(null)

  const setActive = useMutation({
    mutationFn: (product: Product) =>
      unwrap(api.catalog.products({ id: product.id }).patch({ isActive: !product.isActive })),
    onSuccess: (product) => {
      toast.success(product.isActive ? `เปิดขาย "${product.name}" แล้ว` : `ปิดการขาย "${product.name}" แล้ว`)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (error) => toast.error(error.message),
  })

  const all = products.data ?? []
  const categoryName = new Map(categories.data?.map((category) => [category.id, category.name]))
  const term = search.trim().toLowerCase()
  const visible = all.filter(
    (product) =>
      (filter === 'all' || (filter === 'low' ? product.isActive && isLowStock(product) : !product.isActive)) &&
      (term === '' ||
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        product.barcode?.includes(term)),
  )

  return (
    <>
      <PageHeader title="สินค้าและสต็อก" description={`${all.length} รายการ · ราคาเป็นบาท รวม VAT`}>
        <Button className="h-9 px-3" onClick={() => setDialog({ kind: 'form' })}>
          <Plus />
          เพิ่มสินค้า
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedTabs
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'ทั้งหมด', count: all.length },
              { value: 'low', label: 'ใกล้หมด', count: all.filter((product) => product.isActive && isLowStock(product)).length },
              { value: 'inactive', label: 'ปิดการขาย', count: all.filter((product) => !product.isActive).length },
            ]}
          />
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9"
              placeholder="ค้นหาชื่อ รหัส หรือบาร์โค้ด"
              aria-label="ค้นหาสินค้า"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <Panel title="รายการสินค้า" description={`แสดง ${visible.length} จาก ${all.length} รายการ`}>
          {products.error && <p className="p-4 text-sm text-destructive">{products.error.message}</p>}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={tableHead}>สินค้า</TableHead>
                <TableHead className={tableHead}>หมวดหมู่</TableHead>
                <TableHead className={tableHead}>บาร์โค้ด</TableHead>
                <TableHead className={`${tableHead} text-right`}>ราคาขาย</TableHead>
                <TableHead className={`${tableHead} text-right`}>ต้นทุน</TableHead>
                <TableHead className={`${tableHead} text-right`}>คงเหลือ</TableHead>
                <TableHead className={tableHead}>สถานะ</TableHead>
                <TableHead className={`${tableHead} w-0`}>
                  <span className="sr-only">การทำงาน</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((product) => (
                <TableRow key={product.id} className={product.isActive ? '' : 'text-muted-foreground'}>
                  <TableCell className={tableCell}>
                    <div className="flex items-center gap-3">
                      <ProductImage src={product.imageUrl} alt="" className="size-10 rounded-md border" />
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.sku}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className={tableCell}>
                    {(product.categoryId && categoryName.get(product.categoryId)) || '—'}
                  </TableCell>
                  <TableCell className={`${tableCell} tabular-nums`}>{product.barcode ?? '—'}</TableCell>
                  <TableCell className={`${tableCell} text-right tabular-nums`}>{formatBaht(product.priceSatang)}</TableCell>
                  <TableCell className={`${tableCell} text-right tabular-nums`}>{formatBaht(product.costSatang)}</TableCell>
                  <TableCell className={`${tableCell} text-right font-medium tabular-nums`}>
                    {product.trackStock ? product.stockQty : '—'}
                  </TableCell>
                  <TableCell className={tableCell}>
                    {!product.isActive ? (
                      <StatusBadge tone="neutral">ปิดการขาย</StatusBadge>
                    ) : !product.trackStock ? (
                      <StatusBadge tone="neutral">ไม่นับสต็อก</StatusBadge>
                    ) : product.stockQty <= 0 ? (
                      <StatusBadge tone="danger">หมด</StatusBadge>
                    ) : isLowStock(product) ? (
                      <StatusBadge tone="warning">ใกล้หมด</StatusBadge>
                    ) : (
                      <StatusBadge tone="success">พร้อมขาย</StatusBadge>
                    )}
                  </TableCell>
                  <TableCell className={`${tableCell} text-right whitespace-nowrap`}>
                    {product.trackStock && (
                      <Button
                        variant="outline"
                        className="mr-2 h-9"
                        onClick={() => setDialog({ kind: 'stock', product, mode: 'receive' })}
                      >
                        <PackagePlus />
                        รับเข้า
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="size-9" aria-label={`การทำงานอื่นของ ${product.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDialog({ kind: 'form', product })}>แก้ไขสินค้า</DropdownMenuItem>
                        {product.trackStock && (
                          <DropdownMenuItem onSelect={() => setDialog({ kind: 'stock', product, mode: 'adjust' })}>
                            ปรับยอดสต็อก
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setActive.mutate(product)}>
                          {product.isActive ? 'ปิดการขาย' : 'เปิดการขาย'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {!products.isPending && visible.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    ไม่พบสินค้า
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Panel>
      </div>

      {dialog?.kind === 'form' && (
        <ProductFormDialog product={dialog.product} categories={categories.data ?? []} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'stock' && (
        <StockDialog product={dialog.product} mode={dialog.mode} onClose={() => setDialog(null)} />
      )}
    </>
  )
}
