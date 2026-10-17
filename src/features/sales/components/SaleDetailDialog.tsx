import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { SkeletonRows } from '@/components/Skeletons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { currentShiftQuery, registersQuery } from '@/features/shifts'
import { saleQuery, useCashRefund, useVoidSale } from '../api'
import { Receipt } from './Receipt'
import { ReceiptPdfButton } from './ReceiptPdfButton'

interface Props {
  saleId: number
  canVoid: boolean
  onClose: () => void
}

export function SaleDetailDialog({ saleId, canVoid, onClose }: Props) {
  const { t } = useTranslation('sales')
  const [isVoiding, setIsVoiding] = useState(false)
  const receiptRef = useRef<HTMLDivElement>(null)
  const [reason, setReason] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [isRefunding, setIsRefunding] = useState(false)

  const sale = useQuery(saleQuery(saleId))

  const voidSale = useVoidSale(saleId)
  const cashRefund = useCashRefund(saleId)
  const registers = useQuery(registersQuery)
  const registerId = registers.data?.items.find((register) => register.isActive)?.id
  const shift = useQuery({ ...currentShiftQuery(registerId ?? 0), enabled: registerId !== undefined })
  const hasCash = (sale.data?.payments.filter((payment) => payment.method === 'cash').reduce((sum, payment) => sum + payment.amountSatang, 0) ?? 0) > (sale.data?.changeSatang ?? 0)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('detail.title')}</DialogTitle>
          <DialogDescription>{sale.data && t('detail.receiptNo', { receiptNo: sale.data.receiptNo })}</DialogDescription>
        </DialogHeader>

        {sale.error && <p className="text-sm text-destructive">{sale.error.message}</p>}
        {sale.isPending && <SkeletonRows rows={5} />}
        {sale.data && <Receipt sale={sale.data} elementRef={receiptRef} />}

        {isVoiding ? (
          <form
            className="space-y-3"
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
          <div className="flex gap-2">
            {canVoid && sale.data?.status === 'completed' && (
              <Button variant="destructive" className="h-10 flex-1" onClick={() => setIsVoiding(true)}>
                {t('detail.voidSale')}
              </Button>
            )}
            {canVoid && sale.data?.status === 'voided' && hasCash && (
              isRefunding ? (
                <form className="flex-1 space-y-2" onSubmit={(event) => {
                  event.preventDefault()
                  if (!shift.data || !refundReason.trim()) return
                  cashRefund.mutate({ shiftId: shift.data.id, reason: refundReason.trim() }, {
                    onSuccess: () => { toast.success(t('detail.refundRecorded')); setIsRefunding(false) },
                    onError: (error) => toast.error(error.message),
                  })
                }}>
                  <Label htmlFor="refund-reason">{t('detail.refundReason')}</Label>
                  <Textarea id="refund-reason" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} required maxLength={500} />
                  <div className="flex gap-2"><Button type="button" variant="outline" className="h-10 flex-1" onClick={() => setIsRefunding(false)}>{t('detail.keep')}</Button><Button type="submit" className="h-10 flex-1" disabled={!shift.data || !refundReason.trim() || cashRefund.isPending}>{t('detail.confirmRefund')}</Button></div>
                </form>
              ) : <Button variant="outline" className="h-10" disabled={!shift.data} onClick={() => setIsRefunding(true)}>{t('detail.cashRefund')}</Button>
            )}
            <ReceiptPdfButton
              receiptNo={sale.data?.receiptNo ?? ''}
              receiptRef={receiptRef}
              className="h-10 flex-1"
              disabled={!sale.data}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
