import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCartStore } from '../store/cart.store'
import { FloorView } from './FloorView'

/** The floor in a dialog over the sell screen. */
export function FloorDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('pos')
  const workOnOrder = useCartStore((state) => state.workOnOrder)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('floor.title')}</DialogTitle>
          <DialogDescription>{t('floor.description')}</DialogDescription>
        </DialogHeader>
        <FloorView
          onResume={(order) => {
            workOnOrder(order.id)
            onClose()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
