import { z } from 'zod'
import { CAFE_MENU_ITEMS } from '../../../../domains/cafe-menu.domain'

/**
 * Only the keys. Names, prices, options and groups come from the server's own set, so a client can
 * never choose a price — it can only choose which of the set's drinks it wants.
 */
export const applyCafeMenuSchema = z.object({
  itemKeys: z.array(z.string().min(1).max(64)).min(1).max(CAFE_MENU_ITEMS.length),
})
