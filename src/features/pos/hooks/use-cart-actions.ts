import { toast } from 'sonner'
import { useAddOrderItem, useRemoveOrderLine, useSetOrderLineQuantity } from '@/features/orders'
import type { PricedLine } from '../lib/cart'
import { useCartStore } from '../store/cart.store'

/**
 * The ways to change what is being sold. They work on the local cart, or on the open order the till
 * is working on: the screen does not need to know which.
 */
export function useCartActions() {
  const orderId = useCartStore((state) => state.orderId)
  const addToCart = useCartStore((state) => state.add)
  const setCartQuantity = useCartStore((state) => state.setQuantity)
  const addItem = useAddOrderItem()
  const setLine = useSetOrderLineQuantity()
  const removeLine = useRemoveOrderLine()

  const onError = (error: Error) => toast.error(error.message)

  return {
    add(productId: number, optionIds: number[] = []) {
      if (orderId === null) addToCart(productId, optionIds)
      else addItem.mutate({ orderId, productId, quantity: 1, options: optionIds }, { onError })
    },
    /** A quantity below 1 takes the line off. */
    setQuantity(line: PricedLine, quantity: number) {
      if (orderId === null) setCartQuantity(line.lineKey, quantity)
      else if (line.lineId === null) return
      else if (quantity < 1) removeLine.mutate({ orderId, lineId: line.lineId }, { onError })
      else setLine.mutate({ orderId, lineId: line.lineId, quantity }, { onError })
    },
  }
}
