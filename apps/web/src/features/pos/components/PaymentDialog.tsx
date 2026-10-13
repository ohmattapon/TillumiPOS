import { useQuery } from '@tanstack/react-query'
import { Banknote, CreditCard, QrCode, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useFormat } from '@/features/settings'
import type { PaymentInput, PaymentMethod } from '@/lib/money'
import { cn } from '@/lib/utils'
import { qrConfigQuery } from '../api'
import { useQrPayment } from '../hooks/use-qr-payment'
import { QrPaymentPanel } from './QrPaymentPanel'

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
  isSubmitting: boolean
  error?: string
  onConfirm: (payment: PaymentInput) => void
  onCancel: () => void
}

export function PaymentDialog({ totalSatang, isSubmitting, error, onConfirm, onCancel }: Props) {
  const { t } = useTranslation('pos')
  const { t: tc } = useTranslation()
  const { money, currency } = useFormat()
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [received, setReceived] = useState('')

  // With a bank QR set up, PromptPay is paid by scanning and confirmed by the bank, not by the cashier.
  const qrEnabled = useQuery(qrConfigQuery).data?.enabled === true
  const usesQr = method === 'promptpay' && qrEnabled
  const qr = useQrPayment({ amountSatang: totalSatang, active: usesQr })

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
  const canConfirm = changeSatang !== null && changeSatang >= 0 && !isSubmitting && !usesQr

  const unit = 10 ** money.fractionDigits
  const quickCash = (quickCashByCurrency[currency] ?? defaultQuickCash).filter((note) => note * unit >= totalSatang)

  const chooseMethod = (next: PaymentMethod) => {
    // Leaving PromptPay abandons its QR, unless the customer has already paid it.
    if (usesQr && next !== 'promptpay') qr.cancel()
    setMethod(next)
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
                disabled={isSubmitting || (qr.paid !== null && value !== 'promptpay')}
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

          {usesQr && <QrPaymentPanel qr={qr} isSaving={isSubmitting} />}

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
