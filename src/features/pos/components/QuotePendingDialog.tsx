import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  isPending: boolean
  error?: string
  onRetry: () => void
  onCancel: () => void
}

/** Shown while the server prices the cart and pins the promotion and total, before payment opens. */
export function QuotePendingDialog({ isPending, error, onRetry, onCancel }: Props) {
  const { t } = useTranslation('pos')
  const { t: tc } = useTranslation()
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader className="items-center text-center">
          <DialogTitle>{t('payment.pricing.title')}</DialogTitle>
          <DialogDescription>{isPending ? t('payment.pricing.pending') : t('payment.pricing.failed')}</DialogDescription>
        </DialogHeader>
        {isPending && <Skeleton className="h-14 w-full" />}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-12 text-base" onClick={onCancel}>{tc('cancel')}</Button>
          <Button type="button" className="h-12 text-base" disabled={isPending} onClick={onRetry}>
            {t('payment.pricing.retry')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
