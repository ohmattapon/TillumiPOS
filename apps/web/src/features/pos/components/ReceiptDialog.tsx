import type { Sale } from '@pos/api/types'
import { Printer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Receipt } from '@/features/sales'
import { useFormat } from '@/features/settings'

interface Props {
  sale: Sale
  onClose: () => void
}

/** Shown right after a sale: the change to hand back, the receipt, and the way back to selling. */
export function ReceiptDialog({ sale, onClose }: Props) {
  const { t } = useTranslation('pos')
  const { money } = useFormat()
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader className="items-center text-center print:hidden">
          <DialogDescription>{t('receipt.saved')}</DialogDescription>
          <DialogTitle className="text-4xl font-semibold text-success tabular-nums">
            {money.format(sale.changeSatang)}
          </DialogTitle>
        </DialogHeader>
        <Receipt sale={sale} />
        <div className="grid grid-cols-2 gap-2 print:hidden">
          <Button variant="outline" className="h-12 text-base" onClick={() => window.print()}>
            <Printer />
            {t('receipt.print')}
          </Button>
          <Button className="h-12 text-base" onClick={onClose} autoFocus>
            {t('receipt.next')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
