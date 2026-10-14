import type { User } from '@pos/api/types'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'

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
  role: User['role']
  branchId: number
}

export interface UserChanges {
  displayName?: string
  role?: User['role']
  branchId?: number
  isActive?: boolean
  /** Sets a new password. Leave out to keep the current one. */
  password?: string
}

export function useCreateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: NewUserInput) => unwrap(api.users.post(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: UserChanges }) => unwrap(api.users({ id }).patch(changes)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  })
}

export type { User }
