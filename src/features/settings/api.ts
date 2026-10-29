import type { ShopSettings } from '@pos/api/types'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiV2, unwrap } from '@/lib/api'
import { prepareImage } from '@/lib/prepare-image'

export const settingsKeys = {
  all: ['settings'] as const,
}

/** Rarely changes, and every screen formats money with it, so it is kept for a good while. */
export const settingsQuery = queryOptions({
  queryKey: settingsKeys.all,
  queryFn: () => unwrap(api.settings.get()),
  staleTime: 5 * 60_000,
})

// 80 mm paper is 576 printer dots wide, so a logo gains nothing from more pixels than this.
const LOGO_MAX_EDGE = 512

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

/** Uploads the receipt logo, shrunk first so a phone photo does not travel at full size. */
export function useSetShopLogo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file: File) => unwrap(api.settings.logo.put({ file: await prepareImage(file, LOGO_MAX_EDGE) })),
    onSuccess: (settings) => queryClient.setQueryData(settingsKeys.all, settings),
  })
}

export function useRemoveShopLogo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => unwrap(api.settings.logo.delete()),
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
