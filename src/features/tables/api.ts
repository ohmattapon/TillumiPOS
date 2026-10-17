import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'

export const tableKeys = {
  /** Prefix of every table query: invalidate this after anything that changes tables or the orders on them. */
  all: ['tables'] as const,
}

/** Every table of the working branch with what is open on it. A branch has few, so one request. */
export const tablesQuery = queryOptions({
  queryKey: tableKeys.all,
  queryFn: async () => (await unwrap(api.catalog.tables.get())).items,
  // Other tills open and pay orders too; keep the floor close to the truth without a push channel.
  refetchInterval: 15_000,
})

export interface TableInput {
  name: string
  zone: string | null
  seats: number
}

export interface TableChanges extends Partial<TableInput> {
  x?: number
  y?: number
  width?: number
  height?: number
  sortOrder?: number
  isActive?: boolean
}

export function useCreateTable() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: TableInput) => unwrap(api.catalog.tables.post(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tableKeys.all }),
  })
}

export function useUpdateTable() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: TableChanges }) =>
      unwrap(api.catalog.tables({ id }).patch(changes)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tableKeys.all }),
  })
}
