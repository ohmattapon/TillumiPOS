import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'

export const modifierKeys = {
  /** Prefix of every modifier query: invalidate this after anything that changes groups, options or what a product offers. */
  all: ['modifiers'] as const,
}

/** Every group with its options and the products it is offered on. A shop has few, so one request. */
export const modifierGroupsQuery = queryOptions({
  queryKey: modifierKeys.all,
  queryFn: async () => (await unwrap(api.catalog['modifier-groups'].get())).items,
})

export interface ModifierGroupInput {
  name: string
  required: boolean
  maxSelections: number
  sortOrder: number
}

export interface ModifierOptionInput {
  name: string
  priceSatang: number
  costSatang: number
  sortOrder: number
}

export function useCreateModifierGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ModifierGroupInput) => unwrap(api.catalog['modifier-groups'].post(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: modifierKeys.all }),
  })
}

export function useUpdateModifierGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<ModifierGroupInput> & { isActive?: boolean } }) =>
      unwrap(api.catalog['modifier-groups']({ id }).patch(changes)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: modifierKeys.all }),
  })
}

export function useCreateModifierOption() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ groupId, input }: { groupId: number; input: ModifierOptionInput }) =>
      unwrap(api.catalog['modifier-groups']({ id: groupId }).options.post(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: modifierKeys.all }),
  })
}

export function useUpdateModifierOption() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<ModifierOptionInput> & { isActive?: boolean } }) =>
      unwrap(api.catalog['modifier-options']({ id }).patch(changes)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: modifierKeys.all }),
  })
}
