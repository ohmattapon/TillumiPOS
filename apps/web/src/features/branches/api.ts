import type { Branch } from '@pos/api/types'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'

export const branchKeys = {
  all: ['branches'] as const,
}

/** An owner gets every branch, anyone else only their own. The list is small, so it is read in one request. */
export const branchesQuery = queryOptions({
  queryKey: branchKeys.all,
  queryFn: async () => (await unwrap(api.branches.get())).items,
  staleTime: 5 * 60_000,
})

export interface BranchInput {
  name: string
  address: string | null
  phone: string | null
}

export function useCreateBranch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: BranchInput & { code: string }) => unwrap(api.branches.post(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: branchKeys.all }),
  })
}

export function useUpdateBranch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<BranchInput> & { isActive?: boolean } }) =>
      unwrap(api.branches({ id }).patch(changes)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: branchKeys.all }),
  })
}

export type { Branch }
