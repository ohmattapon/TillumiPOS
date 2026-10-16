import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { useQrPayment } from '../hooks/use-qr-payment'

function useSecondsLeft(expiresAt: Date | undefined) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - now) / 1000)) : null
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/** The QR the customer scans, and what the till is waiting for. */
export function QrPaymentPanel({ qr, isSaving, onRegenerate }: { qr: ReturnType<typeof useQrPayment>; isSaving: boolean; onRegenerate: () => void }) {
  const { t } = useTranslation('pos')
  const secondsLeft = useSecondsLeft(qr.issued?.expiresAt)
  const expired = secondsLeft === 0 && qr.isWaiting

  if (qr.paid)
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg bg-muted px-4 py-6 text-center">
        <CheckCircle2 className="size-10 text-success" />
        <p className="text-lg font-semibold">{t('payment.qr.paid')}</p>
        {qr.paid.payerName && (
          <p className="text-sm text-muted-foreground">{t('payment.qr.paidFrom', { name: qr.paid.payerName })}</p>
        )}
        {isSaving && <p className="text-sm text-muted-foreground">{t('payment.qr.savingSale')}</p>}
      </div>
    )

  if (qr.createError)
    return (
      <div className="space-y-3 rounded-lg bg-muted px-4 py-6 text-center">
        <p role="alert" className="text-sm text-destructive">
          {t('payment.qr.failed')}: {qr.createError.message}
        </p>
        <Button type="button" variant="outline" className="h-10" onClick={onRegenerate}>
          <RefreshCw />
          {t('payment.qr.regenerate')}
        </Button>
      </div>
    )

  if (!qr.issued)
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg bg-muted px-4 py-10 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">{t('payment.qr.preparing')}</p>
      </div>
    )

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-muted px-4 py-4 text-center">
      <p className="text-sm text-muted-foreground">{t('payment.qr.scan')}</p>
      <img
        src={`data:image/png;base64,${qr.issued.image}`}
        alt={t('payment.qr.imageAlt')}
        className={`size-56 rounded-md bg-white p-2 ${expired ? 'opacity-30' : ''}`}
      />
      {expired ? (
        <>
          <p className="text-sm font-medium text-destructive">{t('payment.qr.expired')}</p>
          <Button type="button" variant="outline" className="h-10" onClick={onRegenerate}>
            <RefreshCw />
            {t('payment.qr.regenerate')}
          </Button>
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('payment.qr.waiting')}
          {secondsLeft !== null && (
            <span className="tabular-nums">· {t('payment.qr.remaining', { time: clock(secondsLeft) })}</span>
          )}
        </p>
      )}
    </div>
  )
}
