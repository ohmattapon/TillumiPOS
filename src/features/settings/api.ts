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

export const updateKeys = {
  status: ['update', 'status'] as const,
}

/** This build beside the newest published release. Checked on purpose, never polled: the shop updates by hand. */
export const updateStatusQuery = queryOptions({
  queryKey: updateKeys.status,
  queryFn: () => unwrap(api.update.status.get()),
  staleTime: 60_000,
})

export function useApplyUpdate() {
  const queryClient = useQueryClient()

  return useMutation({
    // No body: the feed location is fixed server-side, so there is nothing to send.
    mutationFn: () => unwrap(api.update.apply.post()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: updateKeys.status }),
  })
}
