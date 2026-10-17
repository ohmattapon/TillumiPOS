import type { ShopType } from '@pos/api/shop-settings'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { authKeys } from '@/features/auth'
import { api, unwrap } from '@/lib/api'

export const setupKeys = {
  status: ['setup', 'status'] as const,
}

/** Whether the shop still has to be set up (nobody has an account). A failure counts as "no": the login page shows. */
export const setupStatusQuery = queryOptions({
  queryKey: setupKeys.status,
  queryFn: async () => (await unwrap(api.setup.get())).needsSetup,
  retry: false,
  staleTime: Infinity,
})

export interface SetupInput {
  setupCode: string
  shopName: string
  username: string
  displayName: string
  password: string
  shopType: ShopType
}

export function useCompleteSetup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SetupInput) => unwrap(api.setup.post(input)),
    // The POST answer is not the full /me shape (it has no permissions), so let
    // the shell read the signed-in owner back from the server instead of caching it.
    onSuccess: () => {
      queryClient.setQueryData(setupKeys.status, false)
      void queryClient.invalidateQueries({ queryKey: authKeys.me })
    },
  })
}
