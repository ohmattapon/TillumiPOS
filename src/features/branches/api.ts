import type { Branch } from '@pos/api/types'
import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'

export const branchKeys = {
  all: ['branches'] as const,
}

/** The branches the user may see: an owner gets every branch, anyone else only their own. The shop has one. */
export const branchesQuery = queryOptions({
  queryKey: branchKeys.all,
  queryFn: async (): Promise<Branch[]> => (await unwrap(api.branches.get())).items,
  staleTime: 5 * 60_000,
})
