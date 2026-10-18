import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from 'react-i18next'
import { useFormat } from '@/features/settings'

/**
 * A PromptPay QR built locally from the shop's configured target with the bill amount embedded.
 * No bank call, no polling: the cashier checks the money in their banking app and confirms below.
 * A null payload means static mode is on but no usable target is configured yet.
 */
export function StaticQrPanel({ payload, amountSatang }: { payload: string | null; amountSatang: number }) {
  const { t } = useTranslation('pos')
  const { money } = useFormat()

  if (payload === null)
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg bg-muted px-4 py-6 text-center">
        <p role="alert" className="text-sm font-medium text-destructive">
          {t('payment.qr.staticMissing')}
        </p>
        <p className="text-xs text-muted-foreground">{t('payment.qr.staticMissingHint')}</p>
      </div>
    )

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-muted px-4 py-4 text-center">
      <p className="text-sm text-muted-foreground">{t('payment.qr.staticScan', { amount: money.format(amountSatang) })}</p>
      <QRCodeSVG value={payload} size={224} role="img" aria-label={t('payment.qr.imageAlt')} className="rounded-md bg-white p-2" />
      <p className="text-xs text-muted-foreground">{t('payment.qr.staticNote')}</p>
    </div>
  )
}
