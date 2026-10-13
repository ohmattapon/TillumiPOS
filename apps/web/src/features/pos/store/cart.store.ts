import { create } from 'zustand'

/**
 * A cart line holds only the product id and quantity. Names, prices and stock are read from the
 * products query when the cart is priced, so the cart can never show a stale price.
 */
export interface CartLine {
  productId: number
  quantity: number
}

interface CartState {
  lines: CartLine[]
  /** What the cashier typed in the discount field, in baht. Parsed when the cart is priced. */
  discount: string
  /**
   * The open order the till is working on, or null for the one-step cart. Its lines live on the
   * server (they are read through TanStack Query); only which order is chosen is kept here.
   */
  orderId: number | null
  add: (productId: number) => void
  /** A quantity of 0 or less removes the line. */
  setQuantity: (productId: number, quantity: number) => void
  setDiscount: (discount: string) => void
  /** Works on an open order instead of the local cart. */
  workOnOrder: (orderId: number) => void
  /** Empties the cart and stops working on any order (the order itself stays open). */
  clear: () => void
}

/** The cart lives outside React so it survives navigating to another page and back. */
export const useCartStore = create<CartState>()((set) => ({
  lines: [],
  discount: '',
  orderId: null,
  add: (productId) =>
    set((state) => ({
      lines: state.lines.some((line) => line.productId === productId)
        ? state.lines.map((line) => (line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line))
        : [...state.lines, { productId, quantity: 1 }],
    })),
  setQuantity: (productId, quantity) =>
    set((state) => ({
      lines: state.lines
        .map((line) => (line.productId === productId ? { ...line, quantity } : line))
        .filter((line) => line.quantity > 0),
    })),
  setDiscount: (discount) => set({ discount }),
  workOnOrder: (orderId) => set({ orderId, lines: [], discount: '' }),
  clear: () => set({ lines: [], discount: '', orderId: null }),
}))

/** For code outside React, such as the logout handler. */
export const clearCart = () => useCartStore.getState().clear()
