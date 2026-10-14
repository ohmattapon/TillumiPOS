import type { DiningTable } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PaginationBar } from '@/components/PaginationBar'
import { useListPagination } from '@/hooks/use-list-pagination'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { openOrdersQuery, useOpenOrder, type Order } from '@/features/orders'
import { useFormat } from '@/features/settings'
import { FloorPlan, tablesQuery } from '@/features/tables'
import { useCartStore } from '../store/cart.store'

/** The floor: pick a table, then carry on with one of its open orders or open a new one there. */
export function FloorDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('pos')
  const { money } = useFormat()
  const tables = useQuery(tablesQuery)
  const openOrder = useOpenOrder()
  const workOnOrder = useCartStore((state) => state.workOnOrder)
  const [selected, setSelected] = useState<DiningTable | null>(null)
  const paging = useListPagination(`table:${selected?.id ?? ''}`, 5)
  const orders = useQuery({
    ...openOrdersQuery({ tableId: selected?.id, limit: paging.pageSize, offset: paging.offset }),
    enabled: selected !== null,
  })

  const here = orders.data?.items ?? []
  const usable = (tables.data ?? []).filter((table) => table.isActive)

  const resume = (order: Order) => {
    workOnOrder(order.id)
    onClose()
  }

  const startNew = () => {
    if (!selected) return
    openOrder.mutate(
      { tableId: selected.id },
      {
        onSuccess: (order) => resume(order),
        onError: (error) => toast.error(error.message),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('floor.title')}</DialogTitle>
          <DialogDescription>{t('floor.description')}</DialogDescription>
        </DialogHeader>

        {tables.error && <p className="text-sm text-destructive">{tables.error.message}</p>}
        <FloorPlan
          tables={tables.data ?? []}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          renderBadge={(table) =>
            table.openOrders > 0
              ? `${t('floor.orders', { count: table.openOrders })} · ${money.plain(table.openTotalSatang)}`
              : t('floor.free')
          }
        />
        {!tables.isPending && usable.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">{t('floor.empty')}</p>
        )}

        {selected && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="font-medium">{selected.name}</p>
            <ul className="divide-y">
              {here.map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    {order.label ?? t('orders.untitled', { id: order.id })} · {money.format(order.subtotalSatang)}
                  </span>
                  <Button variant="outline" className="h-9" onClick={() => resume(order)}>
                    {t('orders.resume')}
                  </Button>
                </li>
              ))}
            </ul>
            {orders.error && <p className="text-sm text-destructive">{orders.error.message}</p>}
            <PaginationBar {...paging} total={orders.data?.total} isLoading={orders.isFetching} onPageChange={paging.setPage} />
            <Button className="h-10" onClick={startNew} disabled={openOrder.isPending}>
              {t('floor.newOrder', { name: selected.name })}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
