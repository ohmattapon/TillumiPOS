import type { Order } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { openOrdersQuery, useMergeOrders, useMoveOrder, useSplitOrder } from '@/features/orders'
import { useFormat } from '@/features/settings'
import { tablesQuery } from '@/features/tables'
import { useCartStore } from '../store/cart.store'

type Tool = 'move' | 'merge' | 'split' | null

function MoveDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const { t } = useTranslation('pos')
  const { t: tc } = useTranslation()
  const tables = useQuery(tablesQuery)
  const move = useMoveOrder()

  const choose = (tableId: number | null) =>
    move.mutate(
      { orderId: order.id, tableId },
      {
        onSuccess: () => {
          toast.success(t('tools.moved'))
          onClose()
        },
        onError: (error) => toast.error(error.message),
      },
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('tools.move')}</DialogTitle>
          <DialogDescription>{t('tools.moveDescription')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {(tables.data ?? [])
            .filter((table) => table.isActive)
            .map((table) => (
              <Button
                key={table.id}
                variant={table.id === order.tableId ? 'default' : 'outline'}
                className="h-11"
                disabled={move.isPending}
                onClick={() => choose(table.id)}
              >
                {table.name}
              </Button>
            ))}
          <Button variant="ghost" className="h-11" disabled={move.isPending} onClick={() => choose(null)}>
            {t('tools.noTable')}
          </Button>
        </div>
        <DialogFooter sticky>
          <Button variant="outline" className="h-10" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MergeDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const { t } = useTranslation('pos')
  const { t: tc } = useTranslation()
  const { money } = useFormat()
  const open = useQuery(openOrdersQuery)
  const merge = useMergeOrders()
  const others = (open.data ?? []).filter((other) => other.id !== order.id)

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('tools.merge')}</DialogTitle>
          <DialogDescription>{t('tools.mergeDescription')}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
          {others.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">{t('tools.nothingToMerge')}</li>
          )}
          {others.map((other) => (
            <li key={other.id} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="min-w-0 truncate">
                {other.label ?? t('orders.untitled', { id: other.id })} · {money.format(other.subtotalSatang)}
              </span>
              <Button
                className="h-9"
                disabled={merge.isPending}
                onClick={() =>
                  merge.mutate(
                    { orderId: order.id, sourceOrderId: other.id },
                    {
                      onSuccess: () => {
                        toast.success(t('tools.merged'))
                        onClose()
                      },
                      onError: (error) => toast.error(error.message),
                    },
                  )
                }
              >
                {t('tools.mergeIn')}
              </Button>
            </li>
          ))}
        </ul>
        <DialogFooter sticky>
          <Button variant="outline" className="h-10" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SplitDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const { t } = useTranslation('pos')
  const { t: tc } = useTranslation()
  const split = useSplitOrder()
  const workOnOrder = useCartStore((state) => state.workOnOrder)
  // How many of each line go to the new order.
  const [taken, setTaken] = useState<Record<number, number>>({})

  const lines = Object.entries(taken)
    .filter(([, quantity]) => quantity > 0)
    .map(([lineId, quantity]) => ({ lineId: Number(lineId), quantity }))
  const units = order.items.reduce((total, line) => total + line.quantity, 0)
  const takenUnits = lines.reduce((total, line) => total + line.quantity, 0)
  // At least one unit must stay on the original order.
  const canSplit = lines.length > 0 && takenUnits < units && !split.isPending

  const change = (lineId: number, quantity: number, max: number) =>
    setTaken({ ...taken, [lineId]: Math.min(Math.max(quantity, 0), max) })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('tools.split')}</DialogTitle>
          <DialogDescription>{t('tools.splitDescription')}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
          {order.items.map((line) => (
            <li key={line.lineId} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="min-w-0 truncate">
                {line.productName}
                {line.options.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {' '}
                    · {line.options.map((option) => option.name).join(', ')}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  className="size-9"
                  aria-label={t('tools.less', { name: line.productName })}
                  onClick={() => change(line.lineId, (taken[line.lineId] ?? 0) - 1, line.quantity)}
                >
                  −
                </Button>
                <span className="w-14 text-center tabular-nums">
                  {taken[line.lineId] ?? 0} / {line.quantity}
                </span>
                <Button
                  variant="outline"
                  className="size-9"
                  aria-label={t('tools.more', { name: line.productName })}
                  onClick={() => change(line.lineId, (taken[line.lineId] ?? 0) + 1, line.quantity)}
                >
                  +
                </Button>
              </span>
            </li>
          ))}
        </ul>
        {lines.length > 0 && takenUnits >= units && <p className="text-sm text-destructive">{t('tools.leaveOne')}</p>}
        <DialogFooter sticky>
          <Button variant="outline" className="h-10" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button
            className="h-10"
            disabled={!canSplit}
            onClick={() =>
              split.mutate(
                { orderId: order.id, lines },
                {
                  onSuccess: (created) => {
                    toast.success(t('tools.splitDone'))
                    workOnOrder(created.id)
                    onClose()
                  },
                  onError: (error) => toast.error(error.message),
                },
              )
            }
          >
            {t('tools.split')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Move, merge and split for the order the till is working on. */
export function OrderTools({ order }: { order: Order }) {
  const { t } = useTranslation('pos')
  const [tool, setTool] = useState<Tool>(null)

  return (
    <>
      <div className="flex gap-2 border-b px-4 py-2">
        <Button variant="outline" className="h-9 flex-1" onClick={() => setTool('move')}>
          {t('tools.move')}
        </Button>
        <Button variant="outline" className="h-9 flex-1" onClick={() => setTool('merge')}>
          {t('tools.merge')}
        </Button>
        <Button variant="outline" className="h-9 flex-1" disabled={order.itemCount < 2} onClick={() => setTool('split')}>
          {t('tools.split')}
        </Button>
      </div>
      {tool === 'move' && <MoveDialog order={order} onClose={() => setTool(null)} />}
      {tool === 'merge' && <MergeDialog order={order} onClose={() => setTool(null)} />}
      {tool === 'split' && <SplitDialog key={order.id} order={order} onClose={() => setTool(null)} />}
    </>
  )
}
