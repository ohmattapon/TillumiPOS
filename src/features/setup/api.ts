import type { ShopType } from '@pos/api/shop-settings'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import i18n from 'i18next'
import { toast } from 'sonner'
import { authKeys } from '@/features/auth'
import { api, unwrap } from '@/lib/api'
import type { promptPayChangesFor } from './lib/setup-form'

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
  /** Optional. The setup call has no such field, so it is saved right after, by the signed-in owner. */
  promptpay?: ReturnType<typeof promptPayChangesFor>
}

export function useCompleteSetup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ promptpay, ...input }: SetupInput) => {
      const owner = await unwrap(api.setup.post(input))
      if (promptpay) {
        // The shop is set up by now, so a failure here must not look like a failed setup: say so, and the
        // owner can enter the number in the shop settings.
        await unwrap(api.settings.patch(promptpay)).catch(() => toast.error(i18n.t('setup:promptpayFailed')))
      }
      return owner
    },
    // The POST answer is not the full /me shape (it has no permissions), so let
    // the shell read the signed-in owner back from the server instead of caching it.
    onSuccess: () => {
      queryClient.setQueryData(setupKeys.status, false)
      void queryClient.invalidateQueries({ queryKey: authKeys.me })
    },
  })
}
