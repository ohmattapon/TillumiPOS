import { ClipboardList, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Kbd } from '@/components/Kbd'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useFormat, useSettings } from '@/features/settings'
import { tablesQuery } from '@/features/tables'
import { cn } from '@/lib/utils'
import { useCart } from '../hooks/use-cart'
import { useCartActions } from '../hooks/use-cart-actions'
import { useCartStore } from '../store/cart.store'
import { OrderTools } from './OrderTools'

/** The cart, its discount and the pay button. */
interface Props {
  onPay: () => void
  onSaveOrder: () => void
  /** False while the till may not take payment at all, e.g. no shift is open or the shift is being counted. */
  paymentAvailable?: boolean
  /** side: the wide-screen panel. sheet: the same cart, shown from the bottom on a small screen. */
  variant?: 'side' | 'sheet'
  onClose?: () => void
}

export function CartPanel({ onPay, onSaveOrder, paymentAvailable = true, variant = 'side', onClose }: Props) {
  const { t } = useTranslation('pos')
  const { money, currency } = useFormat()
  const { vatMode, vatRateBp } = useSettings()
  const cart = useCart()
  const discount = useCartStore((state) => state.discount)
  const setDiscount = useCartStore((state) => state.setDiscount)
  const clear = useCartStore((state) => state.clear)
  const storedLines = useCartStore((state) => state.lines)
  const { setQuantity } = useCartActions()
  const isOrder = cart.orderId !== null
  const tables = useQuery(tablesQuery)
  const tableName = tables.data?.find((table) => table.id === cart.order?.tableId)?.name

  return (
    <aside
      className={cn(
        'flex flex-col',
        variant === 'side' ? 'hidden w-80 shrink-0 border-l bg-sidebar lg:flex xl:w-96' : 'min-h-0 flex-1',
      )}
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <ShoppingCart className="size-4 text-muted-foreground" />
        <h2 className="min-w-0 truncate text-sm font-semibold">
          {isOrder ? (tableName ?? cart.order?.label ?? t('orders.untitled', { id: cart.orderId })) : t('cart.title')}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">{t('cart.itemCount', { count: cart.itemCount })}</span>
        <Button
          variant="ghost"
          className="ml-auto h-11 text-muted-foreground"
          disabled={storedLines.length === 0 && !isOrder}
          onClick={clear}
        >
          <Trash2 />
          {isOrder ? t('cart.leaveOrder') : t('cart.clear')}
        </Button>
        {onClose && <Button variant="ghost" className="size-11 shrink-0" aria-label={t('cart.close')} onClick={onClose}><X /></Button>}
      </div>

      {cart.order && cart.order.status === 'open' && <OrderTools order={cart.order} />}

      <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
        {cart.isLoadingProducts && <li className="p-4"><Skeleton className="h-24 w-full" /></li>}
        {cart.productError && <li role="alert" className="p-4 text-sm text-destructive">{cart.productError.message}</li>}
        {cart.hasUnavailableProducts && <li role="alert" className="p-4 text-sm text-destructive">{t('cart.productUnavailable')}</li>}
        {!cart.isLoadingProducts && !cart.productError && !cart.hasUnavailableProducts && cart.lines.length === 0 && (
          <li className="px-4 py-16 text-center text-sm text-muted-foreground">{t('cart.empty')}</li>
        )}
        {cart.lines.map((line) => {
          const { lineKey, name, unitPriceSatang, stockQty, quantity, lineTotalSatang, exceedsStock, options, unavailable } = line
          return (
          <li key={lineKey} className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-base leading-snug font-medium">{name}</p>
              <p className="shrink-0 text-sm font-semibold tabular-nums">{money.plain(lineTotalSatang)}</p>
            </div>
            {options.length > 0 && (
              <ul className="-mt-1 space-y-0.5 text-xs text-muted-foreground">
                {options.map((option) => (
                  <li key={option.name} className="flex justify-between gap-3">
                    <span className="truncate">{option.name}</span>
                    {option.priceSatang > 0 && <span className="tabular-nums">+{money.plain(option.priceSatang)}</span>}
                  </li>
                ))}
              </ul>
            )}
            {unavailable && <p className="text-xs font-medium text-destructive">{t('cart.optionUnavailable')}</p>}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="size-11 bg-background"
                onClick={() => setQuantity(line, quantity - 1)}
                aria-label={t('cart.decrease', { name })}
              >
                <Minus />
              </Button>
              <Input
                className="h-11 w-16 bg-background text-center text-base! font-semibold tabular-nums"
                inputMode="numeric"
                aria-label={t('cart.quantity', { name })}
                aria-invalid={exceedsStock || unavailable}
                value={quantity}
                onFocus={(event) => event.target.select()}
                onChange={(event) => {
                  const next = Number.parseInt(event.target.value, 10)
                  if (next >= 1) setQuantity(line, next)
                }}
              />
              <Button
                variant="outline"
                className="size-11 bg-background"
                onClick={() => setQuantity(line, quantity + 1)}
                aria-label={t('cart.increase', { name })}
              >
                <Plus />
              </Button>
              <span
                className={cn(
                  'ml-auto text-xs tabular-nums',
                  exceedsStock ? 'font-medium text-destructive' : 'text-muted-foreground',
                )}
              >
                {exceedsStock
                  ? t('cart.onlyLeft', { count: stockQty })
                  : `@ ${money.plain(unitPriceSatang)}`}
              </span>
            </div>
          </li>
          )
        })}
      </ul>

      <div className="space-y-3 border-t bg-background p-4">
        <p className="flex justify-between text-sm text-muted-foreground">
          <span>{t('cart.subtotal')}</span>
          <span className="tabular-nums">{money.format(cart.subtotalSatang)}</span>
        </p>
        <label className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>{t('cart.discount', { currency })}</span>
          <Input
            className="h-11 w-32 text-right tabular-nums"
            inputMode="decimal"
            aria-invalid={!cart.isDiscountValid}
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
            placeholder={money.plain(0)}
          />
        </label>
        {!cart.isDiscountValid && <p className="text-right text-xs text-destructive">{t('cart.discountTooLarge')}</p>}
        {/* When prices already include VAT there is nothing to add; only an added tax is shown here. */}
        {vatMode === 'exclusive' && (
          <p className="flex justify-between text-sm text-muted-foreground">
            <span>{t('cart.vat', { rate: String(vatRateBp / 100) })}</span>
            <span className="tabular-nums">{money.format(cart.vatSatang)}</span>
          </p>
        )}
        <p className="flex items-baseline justify-between border-t pt-3">
          <span className="font-medium">{t('cart.total')}</span>
          <span className="text-3xl font-semibold tabular-nums">{money.format(cart.totalSatang)}</span>
        </p>
        {!isOrder && (
          <Button variant="outline" className="h-11 w-full" disabled={cart.lines.length === 0 || !cart.productsReady} onClick={onSaveOrder}>
            <ClipboardList />
            {t('cart.saveOrder')}
          </Button>
        )}
        <Button className="h-14 w-full gap-3 text-lg" disabled={!cart.canPay || !paymentAvailable} onClick={onPay}>
          {t('cart.pay')}
          <Kbd>F9</Kbd>
        </Button>
      </div>
    </aside>
  )
}
