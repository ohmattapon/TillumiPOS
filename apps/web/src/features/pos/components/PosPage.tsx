import type { Sale } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { openOrdersQuery, usePayOrder } from '@/features/orders'
import { useFormat } from '@/features/settings'
import type { PaymentInput } from '@/lib/money'
import { useCheckout } from '../api'
import { useCart } from '../hooks/use-cart'
import { hasKeyboard } from '../lib/focus'
import { useCartStore } from '../store/cart.store'
import { CartPanel } from './CartPanel'
import { PaymentDialog } from './PaymentDialog'
import { OpenOrdersDialog } from './OpenOrdersDialog'
import { ProductPicker } from './ProductPicker'
import { ReceiptDialog } from './ReceiptDialog'
import { SaveOrderDialog } from './SaveOrderDialog'

/** The sell screen: pick products, review the cart, take payment, show the receipt. */
export function PosPage() {
  const { t } = useTranslation('pos')
  const { date } = useFormat()
  const cart = useCart()
  const clearCart = useCartStore((state) => state.clear)
  const checkout = useCheckout()
  const payOrder = usePayOrder()
  const openOrders = useQuery(openOrdersQuery)
  const [isListingOrders, setIsListingOrders] = useState(false)
  const [isSavingOrder, setIsSavingOrder] = useState(false)

  const [isPaying, setIsPaying] = useState(false)
  const [receipt, setReceipt] = useState<Sale | null>(null)
  const [today] = useState(() => new Date())
  const searchRef = useRef<HTMLInputElement>(null)

  // F9 opens payment from anywhere on the page, when the cart can be paid.
  const { canPay } = cart
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F9') return
      event.preventDefault()
      if (canPay) setIsPaying(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canPay])

  const paid = {
    onSuccess: (sale: Sale) => {
      setReceipt(sale)
      setIsPaying(false)
      clearCart()
    },
  }

  const pay = (payment: PaymentInput) => {
    // An open order is paid through the order, which sells it at the prices it quoted.
    if (cart.orderId !== null)
      payOrder.mutate({ orderId: cart.orderId, discountSatang: cart.discountSatang, payment }, paid)
    else
      checkout.mutate(
        {
          items: cart.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
          discountSatang: cart.discountSatang,
          payment,
        },
        paid,
      )
  }

  const payment = cart.orderId !== null ? payOrder : checkout

  const cancelPayment = () => {
    setIsPaying(false)
    payment.reset()
  }

  const closeReceipt = () => {
    setReceipt(null)
    if (hasKeyboard()) searchRef.current?.focus()
  }

  return (
    <>
      <PageHeader title={t('title')} highlight={date.longDate(today)} description={t('description')}>
        <Button variant="outline" className="h-9 px-3" onClick={() => setIsListingOrders(true)}>
          <ClipboardList />
          {t('orders.button')}
          {!!openOrders.data?.length && (
            <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary tabular-nums">
              {openOrders.data.length}
            </span>
          )}
        </Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1 print:hidden">
        <ProductPicker searchRef={searchRef} />
        <CartPanel onPay={() => setIsPaying(true)} onSaveOrder={() => setIsSavingOrder(true)} />
      </div>

      {isPaying && (
        <PaymentDialog
          totalSatang={cart.totalSatang}
          isSubmitting={payment.isPending}
          error={payment.error?.message}
          onConfirm={pay}
          onCancel={cancelPayment}
        />
      )}

      {receipt && <ReceiptDialog sale={receipt} onClose={closeReceipt} />}
      {isListingOrders && <OpenOrdersDialog onClose={() => setIsListingOrders(false)} />}
      {isSavingOrder && <SaveOrderDialog onClose={() => setIsSavingOrder(false)} />}
    </>
  )
}
