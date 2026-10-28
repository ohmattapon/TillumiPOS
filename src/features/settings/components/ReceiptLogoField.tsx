import { useQuery } from '@tanstack/react-query'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { imageStorageQuery, useRemoveShopLogo, useSetShopLogo } from '../api'
import { useSettings } from '../hooks/use-settings'

/** The picture printed at the top of every receipt. It is saved at once, not with the rest of the form. */
export function ReceiptLogoField() {
  const { t } = useTranslation('settings')
  const { logoUrl } = useSettings()
  const imageStorage = useQuery(imageStorageQuery).data
  const setLogo = useSetShopLogo()
  const removeLogo = useRemoveShopLogo()
  const fileInput = useRef<HTMLInputElement>(null)
  const busy = setLogo.isPending || removeLogo.isPending

  const fail = (error: Error) => toast.error(error.message)

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label>{t('receipt.logo')}</Label>
      {imageStorage === 'disabled' ? (
        <p className="text-xs text-muted-foreground">{t('receipt.logoNeedsStorage')}</p>
      ) : (
        <>
          <div className="flex items-center gap-4">
            {logoUrl && <img src={logoUrl} alt={t('receipt.logoAlt')} className="max-h-16 max-w-40 rounded-md border bg-white object-contain p-1" />}
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label={t('receipt.logoInput')}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) setLogo.mutate(file, { onSuccess: () => toast.success(t('receipt.logoSaved')), onError: fail })
                event.target.value = ''
              }}
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-9" disabled={busy} onClick={() => fileInput.current?.click()}>
                <ImagePlus />
                {logoUrl ? t('receipt.logoChange') : t('receipt.logoPick')}
              </Button>
              {logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 text-muted-foreground"
                  disabled={busy}
                  onClick={() => removeLogo.mutate(undefined, { onSuccess: () => toast.success(t('receipt.logoRemoved')), onError: fail })}
                >
                  <Trash2 />
                  {t('receipt.logoRemove')}
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('receipt.logoHint')}</p>
        </>
      )}
    </div>
  )
}
