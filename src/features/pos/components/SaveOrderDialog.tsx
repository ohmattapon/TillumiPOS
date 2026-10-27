import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useOpenOrder } from '@/features/orders'
import { canSaveAsOrder } from '../lib/save-order'
import { useCartStore } from '../store/cart.store'

/** Turns the local cart into an open order to pay later, optionally with a label such as a table. */
export function SaveOrderDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('pos')
  const { t: tc } = useTranslation()
  const [label, setLabel] = useState('')
  const memberId = useCartStore((state) => state.memberId)
  const lines = useCartStore((state) => state.lines)
  const clear = useCartStore((state) => state.clear)
  const openOrder = useOpenOrder()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSaveAsOrder(lines)) return
    openOrder.mutate(
      {
        memberId,
        label: label.trim() || null,
        items: lines.map(({ productId, quantity, optionIds }) => ({ productId, quantity, options: optionIds })),
      },
      {
        onSuccess: () => {
          clear()
          toast.success(t('saveOrder.saved'))
          onClose()
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('saveOrder.title')}</DialogTitle>
          <DialogDescription>{t('saveOrder.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="order-label">{t('saveOrder.label')}</Label>
            <Input
              id="order-label"
              className="h-11"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t('saveOrder.placeholder')}
              maxLength={100}
              autoFocus
            />
          </div>

          {openOrder.error && (
            <p role="alert" className="text-sm text-destructive">
              {openOrder.error.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" className="h-10" disabled={openOrder.isPending}>
              {openOrder.isPending ? t('saveOrder.saving') : t('saveOrder.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
