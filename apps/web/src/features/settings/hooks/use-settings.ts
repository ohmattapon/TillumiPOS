import type { ShopSettings } from '@pos/api/types'
import { DEFAULT_SHOP_SETTINGS } from '@pos/api/shop-settings'
import { useQuery } from '@tanstack/react-query'
import { settingsQuery } from '../api'

/**
 * The shop's settings. Until they arrive the defaults stand in, so money and dates can always be
 * formatted and no screen has to wait or branch on "not loaded yet".
 */
export function useSettings(): ShopSettings {
  const { data } = useQuery(settingsQuery)
  return data ?? DEFAULT_SHOP_SETTINGS
}
