import type { Sale } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, LayoutGrid, Monitor, MonitorSmartphone, MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { openOrdersQuery, usePayOrder } from '@/features/orders'
import { useFeatures, useFormat, useSettings } from '@/features/settings'
import {
  isCustomerDisplaySupported,
  openCustomerDisplay,
  PAID_SHOWN_MS,
  PairDisplayDialog,
  useCustomerDisplayPublisher,
} from '@/features/customer-display'
import { checkoutModeQuery, currentShiftQuery, registersQuery, useRegisterSelectionStore } from '@/features/shifts'
import { meQuery } from '@/features/auth'
import { useActiveBranch } from '@/features/branches'
import { useNavigate } from 'react-router'
import type { PaymentInput, PaymentMethod } from '@/lib/money'
import { useCreateQuote } from '@/features/promotions'
import { useCheckout } from '../api'
import { useCart } from '../hooks/use-cart'
import { hasKeyboard } from '../lib/focus'
import { toDisplayState } from '../lib/customer-display'
import { useCartStore } from '../store/cart.store'
import { CartBar } from './CartBar'
import { CartPanel } from './CartPanel'
import { FloorDialog } from './FloorDialog'
import { PaymentDialog } from './PaymentDialog'
import { QuotePendingDialog } from './QuotePendingDialog'
import { OpenOrdersDialog } from './OpenOrdersDialog'
import { ProductPicker } from './ProductPicker'
import { ReceiptDialog } from './ReceiptDialog'
import { SaveOrderDialog } from './SaveOrderDialog'

/** The sell screen: pick products, review the cart, take payment, show the receipt. */
export function PosPage() {
  const { t } = useTranslation('pos')
  const navigate = useNavigate()
  const { date } = useFormat()
  const cart = useCart()
  const clearCart = useCartStore((state) => state.clear)
  const checkout = useCheckout()
  const payOrder = usePayOrder()
  const openOrders = useQuery(openOrdersQuery({ limit: 1 }))
  const openCount = openOrders.data?.total ?? 0
  const checkoutMode = useQuery(checkoutModeQuery)
  const registers = useQuery(registersQuery)
  const me = useQuery(meQuery).data
  const { branch } = useActiveBranch()
  const selections = useRegisterSelectionStore((state) => state.selections)
  const selectedRegisterId = (me && branch && selections[`${me.id}:${branch.id}`]) || registers.data?.items.find((item) => item.isActive)?.id
  const currentShift = useQuery({ ...currentShiftQuery(selectedRegisterId ?? 0), enabled: selectedRegisterId !== undefined })
  const needsShift = checkoutMode.data?.checkoutMode === 'shifts'
  const shiftReady = checkoutMode.data?.checkoutMode === 'legacy' || (needsShift && currentShift.data?.status === 'open')
  const [isListingOrders, setIsListingOrders] = useState(false)
  const [isChoosingTable, setIsChoosingTable] = useState(false)
  const [isSavingOrder, setIsSavingOrder] = useState(false)

  const [isPaying, setIsPaying] = useState(false)
  const [receipt, setReceipt] = useState<Sale | null>(null)
  const settings = useSettings()
  const features = useFeatures()
  // The bank QR the payment dialog is showing, and the sale just paid, for the customer's screen.
  const [shownQr, setShownQr] = useState<{ image: string; expiresAt: string } | null>(null)
  const [paidSale, setPaidSale] = useState<{ totalSatang: number; changeSatang: number } | null>(null)

  // "Paid" stays on the customer's screen for a few seconds, then the idle screen returns.
  useEffect(() => {
    if (paidSale === null) return
    const timer = window.setTimeout(() => setPaidSale(null), PAID_SHOWN_MS)
    return () => window.clearTimeout(timer)
  }, [paidSale])

  const [isPairingDisplay, setIsPairingDisplay] = useState(false)
  useCustomerDisplayPublisher(
    {
      locale: settings.locale,
      currency: settings.currency,
      shopName: settings.shopName,
      state: toDisplayState({ cart, vatMode: settings.vatMode, isPaying, qr: shownQr, paidSale }),
    },
    { registerId: selectedRegisterId },
  )
  const [today] = useState(() => new Date())
  const searchRef = useRef<HTMLInputElement>(null)
  const paymentCommandKey = useRef<string | null>(null)

  // A cart without a typed discount is priced by the server first: the promotion it gets and the total it
  // pays are pinned in a quote, and the payment (and a QR) is made from that.
  const createQuote = useCreateQuote()
  const [methodAfterQuote, setMethodAfterQuote] = useState<PaymentMethod>('cash')
  const usesQuote = cart.usesQuote
  const quote = usesQuote ? (createQuote.data ?? null) : null
  const quoteInput = () =>
    cart.orderId !== null
      ? { orderId: cart.orderId }
      : {
          lines: cart.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, options: line.optionIds })),
          memberId: cart.memberId,
        }
  // The price is asked again, e.g. after the QR holding it was cancelled. The dialog opens on the method chosen.
  const requote = (method: PaymentMethod) => {
    setMethodAfterQuote(method)
    createQuote.reset()
    createQuote.mutate(quoteInput())
  }
  // Each time payment opens the cart is priced again, so an earlier quote never shows an old total.
  const startPayment = () => {
    createQuote.reset()
    setMethodAfterQuote('cash')
    setIsPaying(true)
    if (usesQuote) createQuote.mutate(quoteInput())
  }
  // The keyboard handler is set up once per `canPay`, so it reads the latest function through a ref.
  const startPaymentRef = useRef(startPayment)
  useEffect(() => {
    startPaymentRef.current = startPayment
  })

  // F9 opens payment from anywhere on the page, when the cart can be paid.
  const canPay = cart.canPay && shiftReady
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F9') return
      event.preventDefault()
      if (canPay) startPaymentRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canPay])

  const paid = {
    onSuccess: (sale: Sale) => {
      setReceipt(sale)
      setPaidSale({ totalSatang: sale.totalSatang, changeSatang: sale.changeSatang })
      setIsPaying(false)
      paymentCommandKey.current = null
      createQuote.reset()
      clearCart()
    },
  }

  const pay = (payment: PaymentInput, options: { arrived?: boolean } = {}) => {
    // Money that arrived earlier belongs to whatever quote made its QR; the server names it if there is one.
    const quoteId = options.arrived ? undefined : quote?.id
    // A pinned price already holds the discount; the till never adds a typed one on top.
    const discountSatang = quote ? 0 : cart.discountSatang
    paymentCommandKey.current ??= crypto.randomUUID()
    // An open order is paid through the order, which sells it at the prices it quoted.
    if (cart.orderId !== null) {
      payOrder.mutate(
        {
          orderId: cart.orderId, discountSatang, quoteId, payment,
          ...(needsShift && currentShift.data ? { shiftId: currentShift.data.id, idempotencyKey: paymentCommandKey.current } : {}),
        },
        paid,
      )
    } else {
      checkout.mutate(
        {
          items: cart.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, options: line.optionIds })),
          discountSatang, quoteId, memberId: cart.memberId, payment,
          ...(needsShift && currentShift.data ? { shiftId: currentShift.data.id } : {}),
          ...(needsShift ? { idempotencyKey: paymentCommandKey.current } : {}),
        },
        paid,
      )
    }
  }

  const payment = cart.orderId !== null ? payOrder : checkout

  const cancelPayment = () => {
    setIsPaying(false)
    paymentCommandKey.current = null
    createQuote.reset()
    payment.reset()
  }

  const closeReceipt = () => {
    setReceipt(null)
    if (hasKeyboard()) searchRef.current?.focus()
  }

  return (
    <>
      <PageHeader title={t('title')} highlight={date.longDate(today)} description={t('description')}>
        {/* Wide screens keep the buttons in the header; smaller screens put the same actions in one menu. */}
        <div className="hidden items-center gap-2 sm:flex">
          {needsShift && (
            <Button variant="outline" className="h-11 px-3" onClick={() => navigate('/shifts')}>
              {shiftReady ? t('shiftReady') : t('shiftRequired')}
            </Button>
          )}
          {features.tables && (
            <Button variant="outline" className="h-11 px-3" onClick={() => setIsChoosingTable(true)}>
              <LayoutGrid />
              {t('floor.button')}
            </Button>
          )}
          <Button variant="outline" className="h-11 px-3" onClick={() => setIsListingOrders(true)}>
            <ClipboardList />
            {t('orders.button')}
            {openCount > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary tabular-nums">{openCount}</span>}
          </Button>
          {isCustomerDisplaySupported() && (
            <Button variant="outline" className="h-11 px-3" onClick={openCustomerDisplay}>
              <Monitor />
              {t('customerDisplay')}
            </Button>
          )}
          <Button variant="outline" className="h-11 px-3" onClick={() => setIsPairingDisplay(true)}>
            <MonitorSmartphone />
            {t('pairDisplay')}
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="size-11 sm:hidden" aria-label={t('moreActions')}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {needsShift && (
              <DropdownMenuItem onSelect={() => navigate('/shifts')}>
                {shiftReady ? t('shiftReady') : t('shiftRequired')}
              </DropdownMenuItem>
            )}
            {features.tables && (
              <DropdownMenuItem onSelect={() => setIsChoosingTable(true)}>
                <LayoutGrid />
                {t('floor.button')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setIsListingOrders(true)}>
              <ClipboardList />
              {t('orders.button')}
              {openCount > 0 && <span className="ml-auto rounded-full bg-primary/10 px-1.5 text-xs text-primary tabular-nums">{openCount}</span>}
            </DropdownMenuItem>
            {isCustomerDisplaySupported() && (
              <DropdownMenuItem onSelect={openCustomerDisplay}>
                <Monitor />
                {t('customerDisplay')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setIsPairingDisplay(true)}>
              <MonitorSmartphone />
              {t('pairDisplay')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <ProductPicker searchRef={searchRef} />
        <CartPanel
          onPay={startPayment}
          onSaveOrder={() => setIsSavingOrder(true)}
          paymentAvailable={shiftReady === true}
        />
        <CartBar
          onPay={startPayment}
          onSaveOrder={() => setIsSavingOrder(true)}
          paymentAvailable={shiftReady === true}
        />
      </div>

      {isPaying && usesQuote && !quote && (
        <QuotePendingDialog
          isPending={createQuote.isPending}
          error={createQuote.error?.message}
          onRetry={() => createQuote.mutate(quoteInput())}
          onCancel={cancelPayment}
        />
      )}

      {isPaying && (!usesQuote || quote) && (
        <PaymentDialog
          totalSatang={quote ? quote.totalSatang : cart.totalSatang}
          quote={quote}
          shiftId={needsShift ? currentShift.data?.id : undefined}
          isSubmitting={payment.isPending}
          error={payment.error?.message}
          onRequote={requote}
          initialMethod={methodAfterQuote}
          onConfirm={pay}
          onCancel={cancelPayment}
          onQrChange={setShownQr}
        />
      )}

      {receipt && <ReceiptDialog sale={receipt} onClose={closeReceipt} />}
      {isListingOrders && <OpenOrdersDialog onClose={() => setIsListingOrders(false)} />}
      <PairDisplayDialog open={isPairingDisplay} onOpenChange={setIsPairingDisplay} registerId={selectedRegisterId} />
      {features.tables && isChoosingTable && <FloorDialog onClose={() => setIsChoosingTable(false)} />}
      {isSavingOrder && <SaveOrderDialog onClose={() => setIsSavingOrder(false)} />}
    </>
  )
}
