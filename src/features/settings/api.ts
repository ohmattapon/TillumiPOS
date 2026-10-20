import type { ShopSettings } from '@pos/api/types'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiV2, unwrap } from '@/lib/api'

export const settingsKeys = {
  all: ['settings'] as const,
}

/** Rarely changes, and every screen formats money with it, so it is kept for a good while. */
export const settingsQuery = queryOptions({
  queryKey: settingsKeys.all,
  queryFn: () => unwrap(api.settings.get()),
  staleTime: 5 * 60_000,
})

/** Whether this shop has a place to keep pictures (product photos, the receipt logo): uploads are hidden when it has not. */
export const imageStorageQuery = queryOptions({
  queryKey: ['capabilities', 'image-storage'] as const,
  queryFn: async () => (await unwrap(apiV2.capabilities.get())).imageStorage,
  staleTime: Infinity,
})

export type SettingsChanges = Partial<ShopSettings>

export function useUpdateSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (changes: SettingsChanges) => unwrap(api.settings.patch(changes)),
    // The answer is the full settings, so put it straight into the cache: everything re-renders at once.
    onSuccess: (settings) => queryClient.setQueryData(settingsKeys.all, settings),
  })
}
