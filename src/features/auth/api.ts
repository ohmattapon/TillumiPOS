import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { canDo, isPermission, type Permission } from '@pos/api/permissions'
import { settingsKeys } from '@/features/settings'
import { api, unwrap } from '@/lib/api'
import { forgetSession } from './lib/forget-session'
import { completeHandOver } from './lib/hand-over-session'
import { meRefetchInterval } from './lib/me-refetch-interval'

export const authKeys = {
  me: ['auth', 'me'] as const,
  switchUsers: ['auth', 'switch-users'] as const,
}

/** The signed-in user. Fails with 401 when there is no session, which the app shell treats as "show the login page". */
export const meQuery = queryOptions({
  queryKey: authKeys.me,
  queryFn: () => unwrap(api.auth.me.get()),
  retry: false,
  staleTime: 0,
  refetchInterval: meRefetchInterval,
})

export function useLogin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (credentials: { username: string; password: string }) => unwrap(api.auth.login.post(credentials)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.me }),
  })
}

/** Permission data stays in the current-session query, and is refreshed on focus and role edits. */
export function useAuthorization() {
  const user = useQuery(meQuery).data
  return { user, can: (permission: Permission) => Boolean(user && canDo({ role: user.role, permissions: user.permissions.filter(isPermission) }, permission)) }
}

export const useCan = (permission: Permission) => useAuthorization().can(permission)

export function useLogout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => unwrap(api.auth.logout.post()),
    // Back to the login page, with nothing of this user's left in the cache.
    onSuccess: () => forgetSession(queryClient, authKeys.me),
  })
}

/** The people who can take over this till with a PIN. Asked fresh each time the lock screen opens. */
export const switchUsersQuery = queryOptions({
  queryKey: authKeys.switchUsers,
  queryFn: () => unwrap(api.auth['switch-users'].get()),
  staleTime: 0,
})

/**
 * Another person takes over the till with a PIN. The server answers a wrong PIN with 400, never 401, so the
 * till is never treated as signed out. On success the cache is handed over (the user stays non-null).
 */
export function useSwitchUser(options: { onHandOver: (newUserId: number) => void }) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { userId: number; pin: string }) => unwrap(api.auth.switch.post(input)),
    onSuccess: async (user) => {
      // The shop settings belong to the shop, not the person, so they stay on screen while they refetch.
      await completeHandOver(queryClient, authKeys.me, [settingsKeys.all], user.id, options.onHandOver)
    },
  })
}

/** Sets or clears the signed-in user's own PIN; the current password proves it is them. */
export function useSetOwnPin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { currentPassword: string; pin: string | null }) => unwrap(api.auth.me.pin.put(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.me }),
  })
}
