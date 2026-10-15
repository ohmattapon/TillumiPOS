import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import { forgetSession } from './lib/forget-session'

export const authKeys = {
  me: ['auth', 'me'] as const,
}

/** The signed-in user. Fails with 401 when there is no session, which the app shell treats as "show the login page". */
export const meQuery = queryOptions({
  queryKey: authKeys.me,
  queryFn: () => unwrap(api.auth.me.get()),
  retry: false,
  staleTime: Infinity,
})

export function useLogin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (credentials: { username: string; password: string }) => unwrap(api.auth.login.post(credentials)),
    onSuccess: (user) => queryClient.setQueryData(authKeys.me, user),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => unwrap(api.auth.logout.post()),
    // Back to the login page, with nothing of this user's left in the cache.
    onSuccess: () => forgetSession(queryClient, authKeys.me),
  })
}
