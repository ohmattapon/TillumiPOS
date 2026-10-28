import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { SkeletonRows } from '@/components/Skeletons'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { currentShiftQuery, registersQuery } from '@/features/shifts'
import { saleQuery, useCashRefund, useVoidSale } from '../api'
import { LanPrintButton } from './LanPrintButton'
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

        {isVoiding && (
          <ConfirmDialog
            open
            onOpenChange={(open) => !open && setIsVoiding(false)}
            title={t('detail.voidSale')}
            description={t('detail.voidWarning')}
            confirmLabel={t('detail.confirmVoid')}
            pendingLabel={t('detail.voiding')}
            cancelLabel={t('detail.keep')}
            destructive
            pending={voidSale.isPending}
            confirmDisabled={reason.trim() === ''}
            onConfirm={() => {
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
            </div>
          </ConfirmDialog>
        )}
        {!isVoiding && (
          <div className="flex gap-2">
            {canVoid && sale.data?.status === 'completed' && (
              <Button variant="destructive" className="h-10 flex-1" onClick={() => setIsVoiding(true)}>
                {t('detail.voidSale')}
              </Button>
            )}
            {canVoid && sale.data?.status === 'voided' && hasCash && (
              isRefunding ? (
                <ConfirmDialog
                  open
                  onOpenChange={(open) => !open && setIsRefunding(false)}
                  title={t('detail.cashRefund')}
                  confirmLabel={t('detail.confirmRefund')}
                  cancelLabel={t('detail.keep')}
                  pending={cashRefund.isPending}
                  confirmDisabled={!shift.data || !refundReason.trim()}
                  onConfirm={() => {
                    if (!shift.data || !refundReason.trim()) return
                    cashRefund.mutate({ shiftId: shift.data.id, reason: refundReason.trim() }, {
                      onSuccess: () => { toast.success(t('detail.refundRecorded')); setIsRefunding(false) },
                      onError: (error) => toast.error(error.message),
                    })
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="refund-reason">{t('detail.refundReason')}</Label>
                    <Textarea id="refund-reason" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} required maxLength={500} autoFocus />
                  </div>
                </ConfirmDialog>
              ) : <Button variant="outline" className="h-10" disabled={!shift.data} onClick={() => setIsRefunding(true)}>{t('detail.cashRefund')}</Button>
            )}
            <LanPrintButton saleId={saleId} receiptRef={receiptRef} disabled={!sale.data} />
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
