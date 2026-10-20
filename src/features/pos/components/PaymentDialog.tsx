import { useQuery } from '@tanstack/react-query'
import { Banknote, CreditCard, QrCode, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PaginationBar } from '@/components/PaginationBar'
import { useListPagination } from '@/hooks/use-list-pagination'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useFormat, settingsQuery } from '@/features/settings'
import { unclaimedQrQuery } from '@/features/shifts'
import type { Quote } from '@/features/promotions'
import type { PaymentInput, PaymentMethod } from '@/lib/money'
import type { DisplayQr } from '@/features/customer-display'
import { cn } from '@/lib/utils'
import { qrConfigQuery } from '../api'
import { useQrPayment } from '../hooks/use-qr-payment'
import { pickDisplayQr } from '../lib/display-qr'
import { resolveStaticQr } from '../lib/static-qr'
import { QrPaymentPanel } from './QrPaymentPanel'
import { StaticQrPanel } from './StaticQrPanel'

const methods: { value: PaymentMethod; icon: LucideIcon }[] = [
  { value: 'cash', icon: Banknote },
  { value: 'promptpay', icon: QrCode },
  { value: 'card', icon: CreditCard },
]

// Banknotes a customer is likely to hand over, in whole units of the currency.
const quickCashByCurrency: Record<string, number[]> = { THB: [20, 50, 100, 500, 1000] }
const defaultQuickCash = [5, 10, 20, 50, 100]

interface Props {
  totalSatang: number
  /** The pinned price this payment is made at: its promotion is shown and a QR is made from it. */
  quote?: Quote | null
  isSubmitting: boolean
  error?: string
  onConfirm: (payment: PaymentInput, options?: { arrived?: boolean }) => void
  onCancel: () => void
  /** The open shift the payment is taken in. Set in shift mode, where a bank QR is asked for on its behalf. */
  shiftId?: number
  /** Asks for the price again, under the method chosen, once a QR holding it has been cancelled. */
  onRequote: (method: PaymentMethod) => void
  /** The method the dialog opens on: the one chosen when the price was asked again. */
  initialMethod?: PaymentMethod
  /**
   * Tells the till which QR is showing (or null), so the customer's screen can show the same one: the bank's
   * QR, or the payload of a static PromptPay QR. Called again with null when the QR is paid, replaced or the dialog closes.
   */
  onQrChange?: (qr: DisplayQr | null) => void
}

export function PaymentDialog({ totalSatang, quote, isSubmitting, error, onConfirm, onCancel, shiftId, onRequote, initialMethod = 'cash', onQrChange }: Props) {
  const { t } = useTranslation('pos')
  const { t: tc } = useTranslation()
  const { money, currency, date } = useFormat()
  const [method, setMethod] = useState<PaymentMethod>(initialMethod)
  const [received, setReceived] = useState('')

  // With a bank QR set up, PromptPay is paid by scanning and confirmed by the bank, not by the cashier.
  const qrEnabled = useQuery(qrConfigQuery).data?.enabled === true
  // Static PromptPay: the QR is built locally with the bill amount, the bank is never asked,
  // and the cashier confirms below after checking their banking app (the trust-flow confirm).
  const settings = useQuery(settingsQuery).data
  const staticQr = resolveStaticQr(method === 'promptpay' ? settings : undefined, totalSatang)
  const showStaticQr = staticQr.kind !== 'off'
  const usesQr = method === 'promptpay' && qrEnabled && !showStaticQr
  const qr = useQrPayment({ amountSatang: totalSatang, quoteId: quote?.id, active: usesQr, shiftId })

  // The customer's screen follows the QR on this dialog. It is keyed by the QR's id: a new QR is a new
  // message, and a paid QR (or a closed dialog) clears it.
  const shown = pickDisplayQr({ bank: usesQr && qr.issued && !qr.paid ? qr.issued : null, staticQr })
  useEffect(() => {
    onQrChange?.(shown?.qr ?? null)
    return () => onQrChange?.(null)
    // The callback is a state setter, stable by design; only another QR should send again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown?.key])

  // Money that already arrived for exactly this total and has no sale yet (a late payment, or a sale that
  // failed after the customer paid). Using it means the customer does not pay twice.
  const qrPaging = useListPagination(`arrived:${totalSatang}`, 5)
  const unclaimed = useQuery({ ...unclaimedQrQuery({ amountSatang: totalSatang, limit: qrPaging.pageSize, offset: qrPaging.offset }), enabled: usesQr && shiftId !== undefined })
  const usable = unclaimed.data?.items ?? []
  const [confirmingId, setConfirmingId] = useState<number | null>(null)

  const payWithArrivedMoney = async (qrPaymentId: number) => {
    // The QR on screen is cancelled first: a sale made before that would meet the price it still holds.
    if (!(await qr.cancel())) return
    // Money that arrived earlier was made against whatever quote its QR had; the server names that quote if needed.
    onConfirm({ method: 'promptpay', amountSatang: totalSatang, qrPaymentId }, { arrived: true })
  }

  // The sale is recorded the moment the bank confirms, so a customer who has paid is never left waiting.
  const recorded = useRef<number | null>(null)
  useEffect(() => {
    if (!qr.paid || recorded.current === qr.paid.id) return
    recorded.current = qr.paid.id
    onConfirm({ method: 'promptpay', amountSatang: totalSatang, qrPaymentId: qr.paid.id })
    // onConfirm changes every render; the paid QR is what must trigger this, once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr.paid])

  // Non-cash methods always pay the exact total; only cash can be over-tendered.
  const amountSatang = method === 'cash' ? money.parse(received) : totalSatang
  const changeSatang = amountSatang === null ? null : amountSatang - totalSatang
  const canConfirm = changeSatang !== null && changeSatang >= 0 && !isSubmitting && !usesQr && !qr.isCancelling && staticQr.kind !== 'missing-target'

  const unit = 10 ** money.fractionDigits
  const quickCash = (quickCashByCurrency[currency] ?? defaultQuickCash).filter((note) => note * unit >= totalSatang)

  // A cancelled QR takes the price it held with it, so the price is asked again before another QR or method.
  const reprice = async (next: PaymentMethod) => {
    if (await qr.cancel()) onRequote(next)
  }

  const chooseMethod = (next: PaymentMethod) => {
    if (usesQr && next !== 'promptpay') void reprice(next)
    else setMethod(next)
  }

  const cancel = () => {
    if (usesQr) qr.cancel()
    onCancel()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !isSubmitting && cancel()}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="items-center text-center">
          <DialogDescription>{t('payment.due')}</DialogDescription>
          <DialogTitle className="text-4xl font-semibold tabular-nums">{money.format(totalSatang)}</DialogTitle>
          {quote?.promotion && (
            <p className="text-sm text-muted-foreground">
              {t('payment.promotion', { name: quote.promotion.name, amount: money.format(quote.promotion.discountSatang) })}
            </p>
          )}
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (canConfirm && amountSatang !== null) onConfirm({ method, amountSatang })
          }}
        >
          <div className="grid grid-cols-3 gap-2">
            {methods.map(({ value, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={method === value}
                disabled={isSubmitting || (qr.paid !== null && value !== 'promptpay') || (qr.isCreating && value !== 'promptpay')}
                onClick={() => chooseMethod(value)}
                className={cn(
                  'flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50',
                  method === value ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted',
                )}
              >
                <Icon className="size-5" />
                {tc(`paymentMethods.${value}`)}
              </button>
            ))}
          </div>

          {usesQr && <QrPaymentPanel qr={qr} isSaving={isSubmitting} onRegenerate={() => void reprice('promptpay')} />}
          {showStaticQr && <StaticQrPanel payload={staticQr.kind === 'ready' ? staticQr.payload : null} amountSatang={totalSatang} />}
          {usesQr && qr.cancelError && <p role="alert" className="text-sm text-destructive">{t('payment.qr.cancelFailed')}</p>}
          {usesQr && !qr.paid && ((unclaimed.data?.total ?? 0) > 0 || qrPaging.page > 0) && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">{t('payment.qr.arrivedTitle')}</p>
              <ul className="space-y-2">
                {usable.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {payment.payerName ?? t('payment.qr.unknownPayer')}
                      {payment.paidAt ? ` · ${date.dateTime(payment.paidAt)}` : ''}
                    </span>
                    {confirmingId === payment.id ? (
                      <span className="flex gap-2">
                        <Button type="button" variant="outline" className="h-11" onClick={() => setConfirmingId(null)}>
                          {tc('cancel')}
                        </Button>
                        <Button type="button" className="h-11" disabled={isSubmitting || qr.isCancelling} onClick={() => payWithArrivedMoney(payment.id)}>
                          {t('payment.qr.arrivedConfirm')}
                        </Button>
                      </span>
                    ) : (
                      <Button type="button" variant="outline" className="h-11" disabled={isSubmitting || qr.isCancelling} onClick={() => setConfirmingId(payment.id)}>
                        {t('payment.qr.arrivedUse')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <PaginationBar {...qrPaging} total={unclaimed.data?.total} isLoading={unclaimed.isFetching || isSubmitting} onPageChange={(page) => { setConfirmingId(null); qrPaging.setPage(page) }} />
              {confirmingId !== null && <p className="text-xs text-muted-foreground">{t('payment.qr.arrivedNote')}</p>}
            </div>
          )}

          {method === 'cash' && (
            <>
              <Input
                className="h-14 text-right text-2xl! tabular-nums"
                inputMode="decimal"
                placeholder={t('payment.receivedPlaceholder', { currency })}
                aria-label={t('payment.receivedLabel', { currency })}
                value={received}
                onChange={(event) => setReceived(event.target.value)}
                autoFocus
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setReceived(money.toInput(totalSatang))}>
                  {t('payment.exact')}
                </Button>
                {quickCash.map((note) => (
                  <Button
                    key={note}
                    type="button"
                    variant="outline"
                    className="h-11 px-4 tabular-nums"
                    onClick={() => setReceived(String(note))}
                  >
                    {note}
                  </Button>
                ))}
              </div>
              <p className="flex items-baseline justify-between rounded-lg bg-muted px-4 py-3">
                <span className="text-muted-foreground">{t('payment.change')}</span>
                <span className="text-2xl font-semibold tabular-nums">
                  {changeSatang !== null && changeSatang >= 0 ? money.format(changeSatang) : '—'}
                </span>
              </p>
            </>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {/* The bank has the money but the sale could not be recorded: try again, never charge again. */}
          {usesQr && qr.paid && error && !isSubmitting && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t('payment.qr.retryNote')}</p>
              <Button
                type="button"
                className="h-12 w-full text-base"
                onClick={() => onConfirm({ method: 'promptpay', amountSatang: totalSatang, qrPaymentId: qr.paid!.id })}
              >
                {t('payment.qr.retry')}
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 text-base"
              disabled={isSubmitting || (qr.paid !== null && !error)}
              onClick={cancel}
            >
              {tc('cancel')}
            </Button>
            {!usesQr && (
              <Button type="submit" className="h-12 text-base" disabled={!canConfirm}>
                {isSubmitting ? t('payment.saving') : t('payment.confirm')}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
