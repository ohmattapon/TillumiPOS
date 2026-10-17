import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import { authKeys } from '@/features/auth'

export const roleKeys = { all: ['roles'] as const }
const fetchRoles = (limit: number, offset: number) => unwrap(api.roles.get({ query: { limit, offset } }))
export type Role = Awaited<ReturnType<typeof fetchRoles>>['items'][number]
export const rolesQuery = (limit = 50, offset = 0) => queryOptions({
  queryKey: [...roleKeys.all, 'list', limit, offset], queryFn: () => fetchRoles(limit, offset),
})
/** Selectors collect every server page so custom roles are never silently omitted. */
export const roleOptionsQuery = queryOptions({
  queryKey: [...roleKeys.all, 'options'],
  queryFn: async () => {
    const items: Role[] = []
    for (let offset = 0; ; offset += 200) {
      const page = await fetchRoles(200, offset)
      items.push(...page.items)
      if (items.length >= page.total || page.items.length === 0) return items
    }
  },
})
export interface RoleInput { name: string; permissions: string[] }
export function useCreateRole() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (body: RoleInput) => unwrap(api.roles.post(body)), onSuccess: () => client.invalidateQueries({ queryKey: roleKeys.all }) })
}
export function useUpdateRole() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<RoleInput> }) => unwrap(api.roles({ id }).patch(changes)),
    onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: roleKeys.all }), client.invalidateQueries({ queryKey: authKeys.me })]) },
  })
}
export function useDeleteRole() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (id: number) => unwrap(api.roles({ id }).delete()), onSuccess: () => client.invalidateQueries({ queryKey: roleKeys.all }) })
}
