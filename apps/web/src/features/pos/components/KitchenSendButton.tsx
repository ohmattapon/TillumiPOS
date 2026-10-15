import type { Order } from '@pos/api/types'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { unsentUnits, useSendOrderToKitchen } from '@/features/kitchen'
import { useIsSavingLineNote } from '@/features/orders'

/**
 * Sends what the kitchen does not have yet. The count is what would go, not what was sent before.
 * It waits while a note is being saved: a tap on this button blurs the note field, and the ticket must not leave ahead of that note.
 */
export function KitchenSendButton({ order }: { order: Order }) {
  const { t } = useTranslation('pos')
  const send = useSendOrderToKitchen()
  const savingNote = useIsSavingLineNote()
  const unsent = order.items.reduce((total, item) => total + unsentUnits(item.quantity, item.sentQuantity), 0)

  return (
    <div className="px-4 py-2">
      <Button
        variant="outline"
        className="h-11 w-full"
        disabled={unsent === 0 || send.isPending || savingNote}
        onClick={() =>
          send.mutate(order.id, {
            onSuccess: () => toast.success(t('kitchen.sent')),
            onError: (error) => toast.error(error.message),
          })
        }
      >
        {t('kitchen.send', { count: unsent })}
      </Button>
    </div>
  )
}
