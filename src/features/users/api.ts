import type { User } from '@pos/api/types'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import { authKeys } from '@/features/auth'
import { roleKeys } from '@/features/roles'

export const userKeys = {
  all: ['users'] as const,
}

/** Everyone who can sign in. Owner only; a shop has few, so they are read in one request. */
export const usersQuery = queryOptions({
  queryKey: userKeys.all,
  queryFn: async () => (await unwrap(api.users.get())).items,
})

export interface NewUserInput {
  username: string
  password: string
  displayName: string
  roleId: number
  /** Left out, the user belongs to the shop's one branch. */
  branchId?: number
}

export interface UserChanges {
  displayName?: string
  role?: User['role']
  roleId?: number
  branchId?: number
  isActive?: boolean
  /** Sets a new password. Leave out to keep the current one. */
  password?: string
}

export function useCreateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: NewUserInput) => unwrap(api.users.post(input)),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: userKeys.all }), queryClient.invalidateQueries({ queryKey: roleKeys.all })]) },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: UserChanges }) => unwrap(api.users({ id }).patch(changes)),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: userKeys.all }), queryClient.invalidateQueries({ queryKey: roleKeys.all }), queryClient.invalidateQueries({ queryKey: authKeys.me })]) },
  })
}

/** An owner or user manager sets or clears another user's PIN. */
export function useSetUserPin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, pin }: { id: number; pin: string | null }) => unwrap(api.users({ id }).pin.put({ pin })),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: userKeys.all }), queryClient.invalidateQueries({ queryKey: authKeys.me })]) },
  })
}

export type { User }
