import type { Sale } from '@pos/api/types'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Receipt, ReceiptPdfButton } from '@/features/sales'
import { useFormat, useSettings } from '@/features/settings'

interface Props {
  sale: Sale
  onClose: () => void
}

/** Shown right after a sale: the change to hand back, the receipt, and the way back to selling. */
export function ReceiptDialog({ sale, onClose }: Props) {
  const { t } = useTranslation('pos')
  const { money } = useFormat()
  const shop = useSettings()
  const receiptRef = useRef<HTMLDivElement>(null)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false} data-receipt-paper={shop.receiptPaperMm}>
        <DialogHeader className="items-center text-center">
          <DialogDescription>{t('receipt.saved')}</DialogDescription>
          <DialogTitle className="text-4xl font-semibold text-success tabular-nums">
            {money.format(sale.changeSatang)}
          </DialogTitle>
        </DialogHeader>
        <Receipt sale={sale} elementRef={receiptRef} />
        <div className="grid grid-cols-2 gap-2">
          <ReceiptPdfButton receiptNo={sale.receiptNo} receiptRef={receiptRef} className="h-12 text-base" />
          <Button className="h-12 text-base" onClick={onClose} autoFocus>
            {t('receipt.next')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
