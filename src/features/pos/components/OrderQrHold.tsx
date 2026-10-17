import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { checkoutModeQuery } from '@/features/shifts'
import { useFormat } from '@/features/settings'
import { orderQrHoldQuery, qrKeys, useCancelQrPayment } from '../api'

/**
 * Shown in the cart of an open order whose price a QR holds: the order cannot be edited until that QR is
 * paid or cancelled. A paid QR is used to pay the order from the payment button, so there is nothing to cancel.
 */
export function OrderQrHold({ orderId }: { orderId: number }) {
  const { t } = useTranslation('pos')
  const { money } = useFormat()
  const queryClient = useQueryClient()
  const hold = useQuery(orderQrHoldQuery(orderId))
  const inShift = useQuery(checkoutModeQuery).data?.checkoutMode === 'shifts'
  const cancel = useCancelQrPayment()

  const held = hold.data
  if (!held) return null
  const amount = money.format(held.amountSatang)

  const cancelHold = () =>
    cancel.mutate(
      { id: held.id, inShift },
      { onSuccess: () => void queryClient.invalidateQueries({ queryKey: qrKeys.orderHold(orderId) }) },
    )

  return (
    <div role="status" className="space-y-2 border-b bg-warning/10 px-4 py-3 text-sm">
      {held.status === 'paid' ? (
        <p>{t('orderHold.paid', { amount })}</p>
      ) : (
        <>
          <p>{t('orderHold.pending', { amount })}</p>
          <Button variant="outline" className="h-11 w-full" disabled={cancel.isPending} onClick={cancelHold}>
            {t('orderHold.cancel')}
          </Button>
          {cancel.error && (
            <p role="alert" className="text-destructive">
              {cancel.error.message}
            </p>
          )}
        </>
      )}
    </div>
  )
}
