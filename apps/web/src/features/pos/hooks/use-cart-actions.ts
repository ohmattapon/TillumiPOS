import { toast } from 'sonner'
import { useAddOrderItem, useRemoveOrderItem, useSetOrderItemQuantity } from '@/features/orders'
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
  const setItem = useSetOrderItemQuantity()
  const removeItem = useRemoveOrderItem()

  const onError = (error: Error) => toast.error(error.message)

  return {
    add(productId: number) {
      if (orderId === null) addToCart(productId)
      else addItem.mutate({ orderId, productId, quantity: 1 }, { onError })
    },
    /** A quantity below 1 takes the product off. */
    setQuantity(productId: number, quantity: number) {
      if (orderId === null) setCartQuantity(productId, quantity)
      else if (quantity < 1) removeItem.mutate({ orderId, productId }, { onError })
      else setItem.mutate({ orderId, productId, quantity }, { onError })
    },
  }
}
