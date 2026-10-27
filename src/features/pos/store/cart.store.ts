import { create } from 'zustand'

/**
 * A cart line holds only the product id, the option ids chosen, the pack chosen and the quantity.
 * Names, prices and stock are read from the products and modifier queries when the cart is priced,
 * so the cart can never show a stale price.
 */
export interface CartLine {
  /** `productId:optionIds`, with `:p<packId>` when the line sells a pack: the same thing twice is one line. */
  key: string
  productId: number
  optionIds: number[]
  /** The pack the line sells; undefined when it sells single pieces. A pack line never carries options. */
  packId?: number
  quantity: number
}

export const cartLineKey = (productId: number, optionIds: readonly number[], packId?: number) =>
  `${productId}:${[...optionIds].sort((a, b) => a - b).join('-')}${packId === undefined ? '' : `:p${packId}`}`

interface CartState {
  lines: CartLine[]
  /** What the cashier typed in the discount field, in baht. Parsed when the cart is priced. */
  discount: string
  /**
   * The open order the till is working on, or null for the one-step cart. Its lines live on the
   * server (they are read through TanStack Query); only which order is chosen is kept here.
   */
  memberId: number | null
  setMember: (memberId: number | null) => void
  orderId: number | null
  add: (productId: number, optionIds?: readonly number[], packId?: number) => void
  /** A quantity of 0 or less removes the line. */
  setQuantity: (key: string, quantity: number) => void
  setDiscount: (discount: string) => void
  /** The cashier chose to sell without the promotion that applies, e.g. to type a discount instead. */
  promotionDeclined: boolean
  setPromotionDeclined: (declined: boolean) => void
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
  memberId: null,
  promotionDeclined: false,
  setMember: (memberId) => set({ memberId }),
  add: (productId, optionIds = [], packId) =>
    set((state) => {
      const key = cartLineKey(productId, optionIds, packId)
      const sortedOptionIds = [...optionIds].sort((a, b) => a - b)
      const line: CartLine = packId === undefined
        ? { key, productId, optionIds: sortedOptionIds, quantity: 1 }
        : { key, productId, optionIds: sortedOptionIds, packId, quantity: 1 }
      return {
        lines: state.lines.some((entry) => entry.key === key)
          ? state.lines.map((entry) => (entry.key === key ? { ...entry, quantity: entry.quantity + 1 } : entry))
          : [...state.lines, line],
      }
    }),
  setQuantity: (key, quantity) =>
    set((state) => ({
      lines: state.lines
        .map((line) => (line.key === key ? { ...line, quantity } : line))
        .filter((line) => line.quantity > 0),
    })),
  setDiscount: (discount) => set({ discount }),
  setPromotionDeclined: (promotionDeclined) => set({ promotionDeclined }),
  workOnOrder: (orderId) => set({ orderId, lines: [], discount: '', memberId: null, promotionDeclined: false }),
  clear: () => set({ lines: [], discount: '', orderId: null, memberId: null, promotionDeclined: false }),
}))

/** For code outside React, such as the logout handler. */
export const clearCart = () => useCartStore.getState().clear()
