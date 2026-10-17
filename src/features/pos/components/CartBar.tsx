import { ShoppingCart } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useFormat } from '@/features/settings'
import { useCart } from '../hooks/use-cart'
import { CartPanel } from './CartPanel'

interface Props {
  onPay: () => void
  onSaveOrder: () => void
  paymentAvailable?: boolean
}

/** Below 1024px: the cart's total and the pay button stay under the thumb; a tap opens the whole cart. */
export function CartBar({ onPay, onSaveOrder, paymentAvailable = true }: Props) {
  const { t } = useTranslation('pos')
  const { money } = useFormat()
  const cart = useCart()
  const [isOpen, setIsOpen] = useState(false)
  // Closing first, so the payment dialog never opens underneath the sheet.
  const pay = () => {
    setIsOpen(false)
    onPay()
  }

  return (
    <div className="flex items-center gap-3 border-t bg-background p-3 lg:hidden print:hidden">
      <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setIsOpen(true)}>
        <ShoppingCart className="size-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">{t('cart.itemCount', { count: cart.itemCount })}</span>
          <span className="block text-xl font-semibold tabular-nums">{money.format(cart.totalSatang)}</span>
        </span>
      </button>
      <Button className="h-12 px-6 text-base" disabled={!cart.canPay || !paymentAvailable} onClick={pay}>
        {t('cart.pay')}
      </Button>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="flex max-h-[90svh] flex-col gap-0 p-0">
          <SheetTitle className="sr-only">{t('cart.title')}</SheetTitle>
          <CartPanel
            variant="sheet"
            onClose={() => setIsOpen(false)}
            onPay={pay}
            onSaveOrder={() => {
              setIsOpen(false)
              onSaveOrder()
            }}
            paymentAvailable={paymentAvailable}
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}
