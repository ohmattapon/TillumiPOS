import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deviceAddress } from '../lib/device-address'

/**
 * Shows the address other devices (iPad, phones, a second till) type or scan to reach this one over the
 * shop Wi-Fi. A QR is only drawn once the address is one another device could actually reach.
 */
export function ConnectDevicesPanel() {
  const { t } = useTranslation('settings')
  const [typed, setTyped] = useState('')
  const address = deviceAddress(typed, window.location.origin)

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">{t('connect.title')}</h2>
        <p className="text-xs text-muted-foreground">{t('connect.intro')}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="connect-address">{t('connect.address')}</Label>
        <Input
          id="connect-address"
          className="h-10"
          inputMode="url"
          autoComplete="off"
          placeholder={t('connect.placeholder')}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          aria-invalid={address.kind === 'invalid'}
        />
        {address.kind === 'needs-ip' && <p className="text-xs text-muted-foreground">{t('connect.needsIp')}</p>}
        {address.kind === 'invalid' && (
          <p role="alert" className="text-xs text-destructive">
            {t('connect.invalid')}
          </p>
        )}
      </div>

      {address.kind === 'ok' && (
        <div className="flex flex-col items-center gap-3 rounded-lg bg-muted px-4 py-4 text-center">
          <QRCodeSVG value={address.url} size={176} role="img" aria-label={t('connect.qrAlt')} className="rounded-md bg-white p-2" />
          <p className="break-all text-base font-semibold">{address.url}</p>
          <p className="text-xs text-muted-foreground">{t('connect.sameWifi')}</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t('connect.install')}</p>
    </section>
  )
}
