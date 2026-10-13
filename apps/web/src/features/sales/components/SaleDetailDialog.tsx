import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { saleQuery, useVoidSale } from '../api'
import { Receipt } from './Receipt'

interface Props {
  saleId: number
  canVoid: boolean
  onClose: () => void
}

export function SaleDetailDialog({ saleId, canVoid, onClose }: Props) {
  const { t } = useTranslation('sales')
  const { t: tc } = useTranslation()
  const [isVoiding, setIsVoiding] = useState(false)
  const [reason, setReason] = useState('')

  const sale = useQuery(saleQuery(saleId))

  const voidSale = useVoidSale(saleId)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="print:hidden">
          <DialogTitle>{t('detail.title')}</DialogTitle>
          <DialogDescription>{sale.data ? t('detail.receiptNo', { receiptNo: sale.data.receiptNo }) : tc('loading')}</DialogDescription>
        </DialogHeader>

        {sale.error && <p className="text-sm text-destructive">{sale.error.message}</p>}
        {sale.data && <Receipt sale={sale.data} />}

        {isVoiding ? (
          <form
            className="space-y-3 print:hidden"
            onSubmit={(event) => {
              event.preventDefault()
              voidSale.mutate(reason.trim(), {
                onSuccess: (voided) => {
                  toast.success(t('detail.voidedToast', { receiptNo: voided.receiptNo }))
                  setIsVoiding(false)
                },
                onError: (error) => toast.error(error.message),
              })
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="void-reason">{t('detail.voidReason')}</Label>
              <Textarea
                id="void-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t('detail.voidPlaceholder')}
                maxLength={500}
                autoFocus
                required
              />
              <p className="text-xs text-muted-foreground">{t('detail.voidWarning')}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-10" onClick={() => setIsVoiding(false)}>
                {t('detail.keep')}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                className="h-10"
                disabled={reason.trim() === '' || voidSale.isPending}
              >
                {voidSale.isPending ? t('detail.voiding') : t('detail.confirmVoid')}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex gap-2 print:hidden">
            {canVoid && sale.data?.status === 'completed' && (
              <Button variant="destructive" className="h-10 flex-1" onClick={() => setIsVoiding(true)}>
                {t('detail.voidSale')}
              </Button>
            )}
            <Button variant="outline" className="h-10 flex-1" disabled={!sale.data} onClick={() => window.print()}>
              <Printer />
              {t('detail.print')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
