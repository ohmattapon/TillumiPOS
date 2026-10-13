import type { Sale } from '@pos/api/types'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { useFormat } from '@/features/settings'
import type { PaymentMethod } from '@/lib/money'
import { useCheckout } from '../api'
import { useCart } from '../hooks/use-cart'
import { hasKeyboard } from '../lib/focus'
import { useCartStore } from '../store/cart.store'
import { CartPanel } from './CartPanel'
import { PaymentDialog } from './PaymentDialog'
import { ProductPicker } from './ProductPicker'
import { ReceiptDialog } from './ReceiptDialog'

/** The sell screen: pick products, review the cart, take payment, show the receipt. */
export function PosPage() {
  const { t } = useTranslation('pos')
  const { date } = useFormat()
  const cart = useCart()
  const clearCart = useCartStore((state) => state.clear)
  const checkout = useCheckout()

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

  const pay = (payment: { method: PaymentMethod; amountSatang: number }) =>
    checkout.mutate(
      {
        items: cart.lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
        discountSatang: cart.discountSatang,
        payment,
      },
      {
        onSuccess: (sale) => {
          setReceipt(sale)
          setIsPaying(false)
          clearCart()
        },
      },
    )

  const cancelPayment = () => {
    setIsPaying(false)
    checkout.reset()
  }

  const closeReceipt = () => {
    setReceipt(null)
    if (hasKeyboard()) searchRef.current?.focus()
  }

  return (
    <>
      <PageHeader title={t('title')} highlight={date.longDate(today)} description={t('description')} />

      <div className="flex min-h-0 flex-1 print:hidden">
        <ProductPicker searchRef={searchRef} />
        <CartPanel onPay={() => setIsPaying(true)} />
      </div>

      {isPaying && (
        <PaymentDialog
          totalSatang={cart.totalSatang}
          isSubmitting={checkout.isPending}
          error={checkout.error?.message}
          onConfirm={pay}
          onCancel={cancelPayment}
        />
      )}

      {receipt && <ReceiptDialog sale={receipt} onClose={closeReceipt} />}
    </>
  )
}
