import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'

export const categoryKeys = {
  all: ['categories'] as const,
}

export const categoriesQuery = queryOptions({
  queryKey: categoryKeys.all,
  queryFn: async () => (await unwrap(api.catalog.categories.get())).items,
})

export interface CategoryChanges {
  name?: string
  sortOrder?: number
  isActive?: boolean
}

export function useCreateCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { name: string; sortOrder?: number }) => unwrap(api.catalog.categories.post(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoryKeys.all }),
  })
}

export function useUpdateCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: CategoryChanges }) =>
      unwrap(api.catalog.categories({ id }).patch(changes)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoryKeys.all }),
  })
}
