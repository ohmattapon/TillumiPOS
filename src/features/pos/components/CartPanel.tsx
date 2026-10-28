import { ClipboardList, Minus, Plus, ShoppingCart, Tag, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Kbd } from '@/components/Kbd'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useSetOrderLineNote } from '@/features/orders'
import { useFormat, useSettings } from '@/features/settings'
import { tablesQuery } from '@/features/tables'
import { cn } from '@/lib/utils'
import { useCart } from '../hooks/use-cart'
import { OrderQrHold } from './OrderQrHold'
import { useCartActions } from '../hooks/use-cart-actions'
import type { PricedLine } from '../lib/cart'
import { noteToSave } from '../lib/note'
import { canSaveAsOrder } from '../lib/save-order'
import { useCartStore } from '../store/cart.store'
import { CartMember } from './CartMember'
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
  /** Why the quote refused the coupon code, shown under the field. */
  couponError?: string | null
}

/**
 * The note on one order line. What is typed is kept here until the field is left;
 * until then the field shows the note the order has.
 */
function LineNote({ orderId, lineId, line }: { orderId: number; lineId: number; line: PricedLine }) {
  const { t } = useTranslation('pos')
  const setNote = useSetOrderLineNote()
  const [draft, setDraft] = useState<string | null>(null)

  // Only a changed note is sent. The typed text stays on screen until the answer is in, so the field never flashes the old note.
  // If the save fails the text stays too, so the cashier can see it and leave the field again to retry.
  const save = () => {
    if (draft === null) return
    const note = noteToSave(draft, line.note)
    if (note === undefined) {
      setDraft(null)
      return
    }
    setNote.mutate(
      { orderId, lineId, note },
      { onError: (error) => toast.error(error.message), onSuccess: () => setDraft(null) },
    )
  }

  return (
    <div className="space-y-1">
      <Input
        className="h-11 bg-background text-sm"
        aria-label={t('note.noteFor', { name: line.name })}
        placeholder={t('note.notePlaceholder')}
        maxLength={500}
        value={draft ?? line.note ?? ''}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
      />
    </div>
  )
}

/**
 * The coupon code. What is typed is kept here until it is sent, so the quote is asked for once
 * per code rather than once per keystroke.
 */
function CouponField({ disabled, error }: { disabled: boolean; error: string | null }) {
  const { t } = useTranslation('pos')
  const code = useCartStore((state) => state.couponCode)
  const setCouponCode = useCartStore((state) => state.setCouponCode)
  const [draft, setDraft] = useState<string | null>(null)
  const apply = () => {
    setCouponCode(draft ?? '')
    setDraft(null)
  }

  return (
    <div className="space-y-1">
      {code !== '' ? (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-accent px-3 py-1 text-sm text-accent-foreground">
          <span className="min-w-0 truncate font-medium">{t('cart.couponApplied', { code })}</span>
          <Button variant="ghost" className="h-11 px-2" onClick={() => setCouponCode('')}>
            {t('cart.couponRemove')}
          </Button>
        </div>
      ) : draft === null ? (
        <Button variant="outline" className="h-11 w-full" disabled={disabled} onClick={() => setDraft('')}>
          <Tag />
          {t('cart.couponAdd')}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            className="h-11 flex-1 bg-background"
            aria-label={t('cart.couponAdd')}
            placeholder={t('cart.couponPlaceholder')}
            maxLength={20}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') apply()
            }}
          />
          <Button className="h-11 shrink-0" onClick={apply}>{t('cart.couponUse')}</Button>
          <Button variant="ghost" className="size-11 shrink-0" aria-label={t('cart.couponCancel')} onClick={() => setDraft(null)}>
            <X />
          </Button>
        </div>
      )}
      {disabled && <p className="text-xs text-muted-foreground">{t('cart.couponNotWithDiscount')}</p>}
      {error !== null && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function CartPanel({ onPay, onSaveOrder, paymentAvailable = true, variant = 'side', onClose, couponError = null }: Props) {
  const { t } = useTranslation('pos')
  const { money, currency } = useFormat()
  const { vatMode, vatRateBp } = useSettings()
  const cart = useCart()
  const discount = useCartStore((state) => state.discount)
  const setDiscount = useCartStore((state) => state.setDiscount)
  const setPromotionDeclined = useCartStore((state) => state.setPromotionDeclined)
  const clear = useCartStore((state) => state.clear)
  const storedLines = useCartStore((state) => state.lines)
  const { setQuantity } = useCartActions()
  const isOrder = cart.orderId !== null
  const tables = useQuery(tablesQuery)
  const tableName = tables.data?.find((table) => table.id === cart.order?.tableId)?.name
  const hasPackLine = storedLines.length > 0 && !canSaveAsOrder(storedLines)

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
          disabled={storedLines.length === 0 && !isOrder && cart.memberId === null}
          onClick={clear}
        >
          <Trash2 />
          {isOrder ? t('cart.leaveOrder') : t('cart.clear')}
        </Button>
        {onClose && <Button variant="ghost" className="size-11 shrink-0" aria-label={t('cart.close')} onClick={onClose}><X /></Button>}
      </div>
      {cart.orderId !== null && <OrderQrHold orderId={cart.orderId} />}

      {cart.order && cart.order.status === 'open' && <OrderTools order={cart.order} />}

      <CartMember />

      <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
        {cart.isLoadingProducts && <li className="p-4"><Skeleton className="h-24 w-full" /></li>}
        {cart.productError && <li role="alert" className="p-4 text-sm text-destructive">{cart.productError.message}</li>}
        {cart.hasUnavailableProducts && <li role="alert" className="p-4 text-sm text-destructive">{t('cart.productUnavailable')}</li>}
        {!cart.isLoadingProducts && !cart.productError && !cart.hasUnavailableProducts && cart.lines.length === 0 && (
          <li className="px-4 py-16 text-center text-sm text-muted-foreground">{t('cart.empty')}</li>
        )}
        {cart.lines.map((line) => {
          const { lineKey, lineId, name, unitPriceSatang, stockQty, quantity, lineTotalSatang, exceedsStock, options, unavailable, packSize } = line
          return (
          <li key={lineKey} className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-base leading-snug font-medium">{name}</p>
                {packSize > 1 && <p className="text-xs text-muted-foreground">{t('cart.pack', { size: packSize })}</p>}
              </div>
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
            {cart.productPromotions.has(line.productId) && (
              <ul aria-label={t('cart.promotions', { name })} className="flex flex-wrap gap-1.5">
                {cart.productPromotions.get(line.productId)!.map((promotion) => (
                  <li key={promotion.id} className="inline-flex max-w-full items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                    <Tag className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">
                      {[
                        promotion.name,
                        promotion.minSubtotalSatang > 0 && t('cart.promotionMin', { amount: money.format(promotion.minSubtotalSatang) }),
                        promotion.membersOnly && t('cart.promotionMembers'),
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
            {cart.orderId !== null && lineId !== null && <LineNote orderId={cart.orderId} lineId={lineId} line={line} />}
          </li>
          )
        })}
      </ul>

      <div className="space-y-3 border-t bg-background p-4">
        <p className="flex justify-between text-sm text-muted-foreground">
          <span>{t('cart.subtotal')}</span>
          <span className="tabular-nums">{money.format(cart.subtotalSatang)}</span>
        </p>
        {cart.promotion ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-accent px-3 py-1 text-sm text-accent-foreground">
            <span className="min-w-0 truncate font-medium">{t('cart.promotion', { name: cart.promotion.name })}</span>
            <span className="flex shrink-0 items-center gap-1">
              <span className="tabular-nums">-{money.format(cart.promotion.discountSatang)}</span>
              <Button variant="ghost" className="h-11 px-2" onClick={() => setPromotionDeclined(true)}>
                {t('cart.promotionRemove')}
              </Button>
            </span>
          </div>
        ) : (
          <>
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
            {cart.promotionDeclined && cart.availablePromotion && (
              <Button variant="outline" className="h-11 w-full" onClick={() => setPromotionDeclined(false)}>
                {t('cart.promotionUse', { name: cart.availablePromotion.name })}
              </Button>
            )}
          </>
        )}
        {/* A coupon is pinned by a quote, so it is offered only while the cart is priced by one. */}
        {!isOrder && <CouponField disabled={discount.trim() !== ''} error={couponError} />}
        {/* The points the member spends come off after the promotion or the typed discount, as the quote prices them. */}
        {cart.pointsDiscountSatang > 0 && (
          <p className="flex justify-between gap-4 text-sm text-muted-foreground">
            <span>{t('cart.pointsDiscount', { points: cart.pointsRedeemed })}</span>
            <span className="tabular-nums">-{money.format(cart.pointsDiscountSatang)}</span>
          </p>
        )}
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
          <>
            <Button variant="outline" className="h-11 w-full" disabled={!canSaveAsOrder(storedLines) || !cart.productsReady} onClick={onSaveOrder}>
              <ClipboardList />
              {t('cart.saveOrder')}
            </Button>
            {hasPackLine && <p className="text-xs text-muted-foreground">{t('cart.saveOrderNoPacks')}</p>}
          </>
        )}
        <Button className="h-14 w-full gap-3 text-lg" disabled={!cart.canPay || !paymentAvailable} onClick={onPay}>
          {t('cart.pay')}
          <Kbd>F9</Kbd>
        </Button>
      </div>
    </aside>
  )
}
