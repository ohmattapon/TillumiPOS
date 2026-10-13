import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'

export const categoryKeys = {
  all: ['categories'] as const,
}

export const categoriesQuery = queryOptions({
  queryKey: categoryKeys.all,
  queryFn: async () => (await unwrap(api.catalog.categories.get())).items,
})
