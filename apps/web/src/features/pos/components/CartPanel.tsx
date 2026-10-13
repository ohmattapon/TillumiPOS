import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { Kbd } from '@/components/Kbd'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatBaht } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useCart } from '../hooks/use-cart'
import { useCartStore } from '../store/cart.store'

/** The cart, its discount and the pay button. */
export function CartPanel({ onPay }: { onPay: () => void }) {
  const cart = useCart()
  const discount = useCartStore((state) => state.discount)
  const setDiscount = useCartStore((state) => state.setDiscount)
  const setQuantity = useCartStore((state) => state.setQuantity)
  const clear = useCartStore((state) => state.clear)

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l bg-sidebar xl:w-96">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <ShoppingCart className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">ตะกร้า</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{cart.itemCount} ชิ้น</span>
        <Button
          variant="ghost"
          className="ml-auto h-9 text-muted-foreground"
          disabled={cart.lines.length === 0}
          onClick={clear}
        >
          <Trash2 />
          ล้าง
        </Button>
      </div>

      <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
        {cart.lines.length === 0 && (
          <li className="px-4 py-16 text-center text-sm text-muted-foreground">ยังไม่มีสินค้าในตะกร้า</li>
        )}
        {cart.lines.map(({ product, quantity, lineTotalSatang, exceedsStock }) => (
          <li key={product.id} className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-sm leading-snug font-medium">{product.name}</p>
              <p className="shrink-0 text-sm font-semibold tabular-nums">{formatBaht(lineTotalSatang)}</p>
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
                aria-invalid={exceedsStock}
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
              <span
                className={cn(
                  'ml-auto text-xs tabular-nums',
                  exceedsStock ? 'font-medium text-destructive' : 'text-muted-foreground',
                )}
              >
                {exceedsStock ? `มีแค่ ${product.stockQty} ชิ้น` : `@ ${formatBaht(product.priceSatang)}`}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-3 border-t bg-background p-4">
        <p className="flex justify-between text-sm text-muted-foreground">
          <span>รวม</span>
          <span className="tabular-nums">฿{formatBaht(cart.subtotalSatang)}</span>
        </p>
        <label className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>ส่วนลด (บาท)</span>
          <Input
            className="h-10 w-32 text-right tabular-nums"
            inputMode="decimal"
            aria-invalid={!cart.isDiscountValid}
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
            placeholder="0.00"
          />
        </label>
        {!cart.isDiscountValid && <p className="text-right text-xs text-destructive">ส่วนลดต้องไม่เกินยอดรวม</p>}
        <p className="flex items-baseline justify-between border-t pt-3">
          <span className="font-medium">ยอดสุทธิ</span>
          <span className="text-3xl font-semibold tabular-nums">฿{formatBaht(cart.totalSatang)}</span>
        </p>
        <Button className="h-14 w-full gap-3 text-lg" disabled={!cart.canPay} onClick={onPay}>
          ชำระเงิน
          <Kbd>F9</Kbd>
        </Button>
      </div>
    </aside>
  )
}
