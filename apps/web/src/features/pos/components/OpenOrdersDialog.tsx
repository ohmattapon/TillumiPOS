import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SkeletonRows } from '@/components/Skeletons'
import { Input } from '@/components/ui/input'
import { openOrdersQuery, useCancelOrder, type Order } from '@/features/orders'
import { useFormat } from '@/features/settings'
import { tablesQuery } from '@/features/tables'
import { useCartStore } from '../store/cart.store'

/** The orders that are open in this branch: pick one to carry on with, or cancel it. */
export function OpenOrdersDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('pos')
  const { money, date } = useFormat()
  const orders = useQuery(openOrdersQuery)
  const tables = useQuery(tablesQuery)
  const cancelOrder = useCancelOrder()
  const workOnOrder = useCartStore((state) => state.workOnOrder)
  const current = useCartStore((state) => state.orderId)

  const [cancelling, setCancelling] = useState<{ id: number; reason: string } | null>(null)

  const resume = (order: Order) => {
    workOnOrder(order.id)
    onClose()
  }

  const confirmCancel = (event: FormEvent) => {
    event.preventDefault()
    if (!cancelling) return
    cancelOrder.mutate(
      { orderId: cancelling.id, reason: cancelling.reason.trim() },
      {
        onSuccess: () => {
          toast.success(t('orders.cancelled'))
          setCancelling(null)
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  const items = orders.data ?? []

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('orders.title')}</DialogTitle>
          <DialogDescription>{t('orders.description')}</DialogDescription>
        </DialogHeader>

        {orders.error && <p className="text-sm text-destructive">{orders.error.message}</p>}
        <ul className="max-h-[60vh] divide-y overflow-y-auto rounded-lg border">
          {!orders.isPending && items.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">{t('orders.empty')}</li>
          )}
          {orders.isPending && (
            <li>
              <SkeletonRows rows={3} />
            </li>
          )}
          {items.map((order) => (
            <li key={order.id} className="space-y-3 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{tables.data?.find((table) => table.id === order.tableId)?.name ?? order.label ?? t('orders.untitled', { id: order.id })}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t('orders.openedBy', { name: order.openedByName, time: date.time(order.createdAt) })}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums">{money.format(order.subtotalSatang)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {t('cart.itemCount', { count: order.itemCount })}
                  </p>
                </div>
              </div>

              {cancelling?.id === order.id ? (
                <form onSubmit={confirmCancel} className="flex items-center gap-2">
                  <Input
                    className="h-10"
                    value={cancelling.reason}
                    onChange={(event) => setCancelling({ id: order.id, reason: event.target.value })}
                    placeholder={t('orders.reasonPlaceholder')}
                    aria-label={t('orders.reasonLabel')}
                    maxLength={500}
                    required
                    autoFocus
                  />
                  <Button type="button" variant="outline" className="h-10" onClick={() => setCancelling(null)}>
                    {t('orders.keep')}
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    className="h-10"
                    disabled={cancelling.reason.trim() === '' || cancelOrder.isPending}
                  >
                    {t('orders.confirmCancel')}
                  </Button>
                </form>
              ) : (
                <div className="flex gap-2">
                  <Button className="h-10 flex-1" disabled={current === order.id} onClick={() => resume(order)}>
                    {current === order.id ? t('orders.working') : t('orders.resume')}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={() => setCancelling({ id: order.id, reason: '' })}
                  >
                    {t('orders.cancel')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
