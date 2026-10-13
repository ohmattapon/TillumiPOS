import type { Product, Sale } from '@pos/api/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, Printer, Search, ShoppingCart, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { PaymentDialog, type PaymentMethod } from '@/components/PaymentDialog'
import { ProductImage } from '@/components/ProductImage'
import { Receipt } from '@/components/Receipt'
import { SegmentedTabs } from '@/components/SegmentedTabs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { api, unwrap } from '@/lib/api'
import { formatBaht, formatLongDate, parseBaht } from '@/lib/money'
import { categoriesQuery, LOW_STOCK_THRESHOLD, productsQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'

interface CartLine {
  product: Product
  quantity: number
}

const Kbd = ({ children }: { children: string }) => (
  <kbd className="rounded border bg-background/20 px-1.5 py-0.5 font-sans text-[11px] leading-none font-medium">
    {children}
  </kbd>
)

// Refocusing the search box on a touch screen would pop the on-screen keyboard after every tap.
const hasKeyboard = () => window.matchMedia('(pointer: fine)').matches

export function PosPage() {
  const queryClient = useQueryClient()
  const products = useQuery(productsQuery())
  const categories = useQuery(categoriesQuery)

  const [cart, setCart] = useState<CartLine[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [discount, setDiscount] = useState('')
  const [isPaying, setIsPaying] = useState(false)
  const [receipt, setReceipt] = useState<Sale | null>(null)
  const [today] = useState(() => new Date())
  const searchInput = useRef<HTMLInputElement>(null)

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (products.data ?? []).filter(
      (product) =>
        (category === 'all' || String(product.categoryId) === category) &&
        (term === '' ||
          product.name.toLowerCase().includes(term) ||
          product.sku.toLowerCase().includes(term) ||
          product.barcode === term),
    )
  }, [products.data, search, category])

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const subtotalSatang = cart.reduce((sum, line) => sum + line.product.priceSatang * line.quantity, 0)
  const discountSatang = discount.trim() === '' ? 0 : parseBaht(discount)
  const isDiscountValid = discountSatang !== null && discountSatang <= subtotalSatang
  const totalSatang = subtotalSatang - (isDiscountValid ? discountSatang : 0)
  const hasOversold = cart.some((line) => line.product.trackStock && line.quantity > line.product.stockQty)
  const canPay = cart.length > 0 && isDiscountValid && totalSatang > 0 && !hasOversold

  const checkout = useMutation({
    mutationFn: (payment: { method: PaymentMethod; amountSatang: number }) =>
      unwrap(
        api.sales.post({
          items: cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
          discountSatang: discountSatang ?? 0,
          payments: [payment],
        }),
      ),
    onSuccess: (sale) => {
      setReceipt(sale)
      setIsPaying(false)
      setCart([])
      setDiscount('')
    },
    // Stock changed on success, and a failure usually means our cached stock or prices are stale.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
    },
  })


  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F2') {
        event.preventDefault()
        searchInput.current?.focus()
        searchInput.current?.select()
      }
      if (event.key === 'F9') {
        event.preventDefault()
        if (canPay) setIsPaying(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canPay])

  const addToCart = (product: Product) => {
    setCart((lines) =>
      lines.some((line) => line.product.id === product.id)
        ? lines.map((line) => (line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line))
        : [...lines, { product, quantity: 1 }],
    )
    if (hasKeyboard()) searchInput.current?.focus()
  }

  const setQuantity = (productId: number, quantity: number) =>
    setCart((lines) =>
      lines
        .map((line) => (line.product.id === productId ? { ...line, quantity } : line))
        .filter((line) => line.quantity > 0),
    )

  // A USB barcode scanner types the code and presses Enter, which lands here.
  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    const term = search.trim().toLowerCase()
    if (term === '') return
    const match =
      products.data?.find((product) => product.barcode === term || product.sku.toLowerCase() === term) ??
      (visibleProducts.length === 1 ? visibleProducts[0] : undefined)
    if (!match) {
      toast.error(`ไม่พบสินค้า "${search.trim()}"`)
    } else if (match.trackStock && match.stockQty <= 0) {
      toast.error(`"${match.name}" หมดสต็อก`)
    } else {
      addToCart(match)
    }
    setSearch('')
  }

  const closeReceipt = () => {
    setReceipt(null)
    if (hasKeyboard()) searchInput.current?.focus()
  }

  return (
    <>
      <PageHeader title="ขายสินค้า" highlight={formatLongDate(today)} description="สแกนบาร์โค้ด หรือแตะสินค้าเพื่อเพิ่มลงตะกร้า" />

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          <form onSubmit={submitSearch} className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInput}
              className="h-12 pr-14 pl-11 text-base!"
              placeholder="สแกนบาร์โค้ด หรือพิมพ์ชื่อ / รหัสสินค้า แล้วกด Enter"
              aria-label="ค้นหาสินค้า"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoFocus
            />
            <span className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">
              <Kbd>F2</Kbd>
            </span>
          </form>

          <div className="-mx-4 overflow-x-auto px-4">
            <SegmentedTabs
              size="touch"
              value={category}
              onChange={setCategory}
              options={[
                { value: 'all', label: 'ทั้งหมด' },
                ...(categories.data ?? [])
                  .filter((item) => item.isActive)
                  .map((item) => ({ value: String(item.id), label: item.name })),
              ]}
            />
          </div>

          {products.error && <p className="text-sm text-destructive">{products.error.message}</p>}
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 overflow-y-auto pb-1">
            {visibleProducts.map((product) => {
              const isOutOfStock = product.trackStock && product.stockQty <= 0
              const isLow = product.trackStock && product.stockQty <= LOW_STOCK_THRESHOLD
              return (
                <button
                  key={product.id}
                  disabled={isOutOfStock}
                  onClick={() => addToCart(product)}
                  className="flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-xs transition-colors outline-none hover:border-primary/50 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent disabled:pointer-events-none disabled:opacity-45"
                >
                  <ProductImage src={product.imageUrl} alt="" className="aspect-[4/3] w-full" />
                  <span className="line-clamp-2 min-h-10 px-3 pt-2 text-sm leading-snug font-medium">{product.name}</span>
                  <span className="flex items-end justify-between gap-2 px-3 pt-1 pb-3">
                    <span className="text-lg font-semibold tabular-nums">฿{formatBaht(product.priceSatang)}</span>
                    {product.trackStock && (
                      <span className={cn('text-xs tabular-nums', isLow ? 'font-medium text-warning' : 'text-muted-foreground')}>
                        {isOutOfStock ? 'หมด' : `เหลือ ${product.stockQty}`}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
            {!products.isPending && visibleProducts.length === 0 && (
              <p className="col-span-full py-12 text-center text-muted-foreground">ไม่พบสินค้าที่ตรงกับการค้นหา</p>
            )}
          </div>
        </section>

        <aside className="flex w-80 shrink-0 flex-col border-l bg-sidebar xl:w-96">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <ShoppingCart className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">ตะกร้า</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{itemCount} ชิ้น</span>
            <Button
              variant="ghost"
              className="ml-auto h-9 text-muted-foreground"
              disabled={cart.length === 0}
              onClick={() => setCart([])}
            >
              <Trash2 />
              ล้าง
            </Button>
          </div>

          <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
            {cart.length === 0 && (
              <li className="px-4 py-16 text-center text-sm text-muted-foreground">ยังไม่มีสินค้าในตะกร้า</li>
            )}
            {cart.map(({ product, quantity }) => {
              const isOver = product.trackStock && quantity > product.stockQty
              return (
                <li key={product.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm leading-snug font-medium">{product.name}</p>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatBaht(product.priceSatang * quantity)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="size-11 bg-background"
                      onClick={() => setQuantity(product.id, quantity - 1)}
                      aria-label={`ลดจำนวน ${product.name}`}
                    >
                      <Minus />
                    </Button>
                    <Input
                      className="h-11 w-16 bg-background text-center text-base! font-semibold tabular-nums"
                      inputMode="numeric"
                      aria-label={`จำนวน ${product.name}`}
                      aria-invalid={isOver}
                      value={quantity}
                      onFocus={(event) => event.target.select()}
                      onChange={(event) => {
                        const next = Number.parseInt(event.target.value, 10)
                        if (next >= 1) setQuantity(product.id, next)
                      }}
                    />
                    <Button
                      variant="outline"
                      className="size-11 bg-background"
                      onClick={() => setQuantity(product.id, quantity + 1)}
                      aria-label={`เพิ่มจำนวน ${product.name}`}
                    >
                      <Plus />
                    </Button>
                    <span className={cn('ml-auto text-xs tabular-nums', isOver ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                      {isOver ? `มีแค่ ${product.stockQty} ชิ้น` : `@ ${formatBaht(product.priceSatang)}`}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="space-y-3 border-t bg-background p-4">
            <p className="flex justify-between text-sm text-muted-foreground">
              <span>รวม</span>
              <span className="tabular-nums">฿{formatBaht(subtotalSatang)}</span>
            </p>
            <label className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
              <span>ส่วนลด (บาท)</span>
              <Input
                className="h-10 w-32 text-right tabular-nums"
                inputMode="decimal"
                aria-invalid={!isDiscountValid}
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                placeholder="0.00"
              />
            </label>
            {!isDiscountValid && <p className="text-right text-xs text-destructive">ส่วนลดต้องไม่เกินยอดรวม</p>}
            <p className="flex items-baseline justify-between border-t pt-3">
              <span className="font-medium">ยอดสุทธิ</span>
              <span className="text-3xl font-semibold tabular-nums">฿{formatBaht(totalSatang)}</span>
            </p>
            <Button className="h-14 w-full gap-3 text-lg" disabled={!canPay} onClick={() => setIsPaying(true)}>
              ชำระเงิน
              <Kbd>F9</Kbd>
            </Button>
          </div>
        </aside>
      </div>

      {isPaying && (
        <PaymentDialog
          totalSatang={totalSatang}
          isSubmitting={checkout.isPending}
          error={checkout.error?.message}
          onConfirm={(payment) => checkout.mutate(payment)}
          onCancel={() => {
            setIsPaying(false)
            checkout.reset()
          }}
        />
      )}

      {receipt && (
        <Dialog open onOpenChange={(open) => !open && closeReceipt()}>
          <DialogContent className="sm:max-w-sm" showCloseButton={false}>
            <DialogHeader className="items-center text-center print:hidden">
              <DialogDescription>บันทึกการขายแล้ว · เงินทอน</DialogDescription>
              <DialogTitle className="text-4xl font-semibold text-success tabular-nums">
                ฿{formatBaht(receipt.changeSatang)}
              </DialogTitle>
            </DialogHeader>
            <Receipt sale={receipt} />
            <div className="grid grid-cols-2 gap-2 print:hidden">
              <Button variant="outline" className="h-12 text-base" onClick={() => window.print()}>
                <Printer />
                พิมพ์ใบเสร็จ
              </Button>
              <Button className="h-12 text-base" onClick={closeReceipt} autoFocus>
                ขายรายการต่อไป
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
