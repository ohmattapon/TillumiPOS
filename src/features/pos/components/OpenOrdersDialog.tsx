import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PaginationBar } from '@/components/PaginationBar'
import { useListPagination } from '@/hooks/use-list-pagination'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SkeletonRows } from '@/components/Skeletons'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { openOrdersQuery, useCancelOrder, type Order } from '@/features/orders'
import { useFormat } from '@/features/settings'
import { tablesQuery } from '@/features/tables'
import { useCartStore } from '../store/cart.store'

/** The orders that are open in this branch: pick one to carry on with, or cancel it. */
export function OpenOrdersDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('pos')
  const { money, date } = useFormat()
  const paging = useListPagination('open-orders', 10)
  const orders = useQuery(openOrdersQuery({ limit: paging.pageSize, offset: paging.offset }))
  const tables = useQuery(tablesQuery)
  const cancelOrder = useCancelOrder()
  const workOnOrder = useCartStore((state) => state.workOnOrder)
  const current = useCartStore((state) => state.orderId)

  const [cancelling, setCancelling] = useState<{ id: number; reason: string } | null>(null)

  const resume = (order: Order) => {
    workOnOrder(order.id)
    onClose()
  }

  const confirmCancel = () => {
    if (!cancelling || cancelling.reason.trim() === '') return
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

  const items = orders.data?.items ?? []
  const cancellingOrder = items.find((order) => order.id === cancelling?.id)
  const cancellingLabel = cancellingOrder
    ? (tables.data?.find((table) => table.id === cancellingOrder.tableId)?.name ??
      cancellingOrder.label ??
      t('orders.untitled', { id: cancellingOrder.id }))
    : ''

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
            </li>
          ))}
        </ul>
        <PaginationBar {...paging} total={orders.data?.total} isLoading={orders.isFetching || cancelOrder.isPending} onPageChange={(page) => { setCancelling(null); paging.setPage(page) }} />
        {cancellingOrder && cancelling && (
          <ConfirmDialog
            open
            onOpenChange={(open) => !open && setCancelling(null)}
            title={t('orders.cancel')}
            description={`${cancellingLabel}, ${money.format(cancellingOrder.subtotalSatang)}`}
            confirmLabel={t('orders.confirmCancel')}
            cancelLabel={t('orders.keep')}
            destructive
            pending={cancelOrder.isPending}
            confirmDisabled={cancelling.reason.trim() === ''}
            onConfirm={confirmCancel}
          >
            <div className="grid gap-2">
              <Label htmlFor="cancel-order-reason">{t('orders.reasonLabel')}</Label>
              <Textarea
                id="cancel-order-reason"
                value={cancelling.reason}
                onChange={(event) => setCancelling({ id: cancelling.id, reason: event.target.value })}
                placeholder={t('orders.reasonPlaceholder')}
                maxLength={500}
                required
                autoFocus
              />
            </div>
          </ConfirmDialog>
        )}
      </DialogContent>
    </Dialog>
  )
}
