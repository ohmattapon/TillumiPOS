import type { ShopSettings } from '@pos/api/types'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'

export const settingsKeys = {
  all: ['settings'] as const,
}

/** Rarely changes, and every screen formats money with it, so it is kept for a good while. */
export const settingsQuery = queryOptions({
  queryKey: settingsKeys.all,
  queryFn: () => unwrap(api.settings.get()),
  staleTime: 5 * 60_000,
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
