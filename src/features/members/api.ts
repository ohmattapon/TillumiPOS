import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'

export const memberKeys = { all: ['members'] as const }
export interface MemberFilters {
  search?: string
  isActive?: boolean
  limit?: number
  offset?: number
}
export const membersQuery = (filters: MemberFilters = {}) =>
  queryOptions({
    queryKey: [...memberKeys.all, 'list', filters],
    queryFn: () => unwrap(api.members.get({ query: { limit: 20, offset: 0, ...filters } })),
  })
const fetchMember = (id: number) => unwrap(api.members({ id }).get())
export const memberQuery = (id: number) =>
  queryOptions({
    queryKey: [...memberKeys.all, 'detail', id],
    queryFn: () => fetchMember(id),
  })
export interface HistoryFilters {
  from?: string
  to?: string
  status?: 'completed' | 'voided'
  limit?: number
  offset?: number
}
export const memberHistoryQuery = (id: number, filters: HistoryFilters = {}) =>
  queryOptions({
    queryKey: [...memberKeys.all, 'history', id, filters],
    queryFn: () => unwrap(api.members({ id }).sales.get({ query: { limit: 20, offset: 0, ...filters } })),
  })
export type Member = Awaited<ReturnType<typeof fetchMember>>

export interface PointsFilters {
  limit?: number
  offset?: number
}
const fetchPoints = (id: number, filters: PointsFilters) =>
  unwrap(api.members({ id }).points.get({ query: { limit: 20, offset: 0, ...filters } }))

export type PointMovement = Awaited<ReturnType<typeof fetchPoints>>['items'][number]

/** Every movement of the member's points, newest first; the balance only moves through this list. */
export const memberPointsQuery = (id: number, filters: PointsFilters = {}) =>
  queryOptions({
    queryKey: [...memberKeys.all, 'points', id, filters],
    queryFn: () => fetchPoints(id, filters),
  })
export function useAdjustMemberPoints() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, points, reason }: { id: number; points: number; reason: string }) =>
      unwrap(api.members({ id }).points.adjustments.post({ points, reason })),
    // The balance and the ledger both changed, and the member list shows the balance.
    onSuccess: () => client.invalidateQueries({ queryKey: memberKeys.all }),
  })
}
export function useCreateMember() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; phone: string }) => unwrap(api.members.post(input)),
    onSuccess: () => client.invalidateQueries({ queryKey: memberKeys.all }),
  })
}
export function useUpdateMember() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      changes,
    }: {
      id: number
      changes: { name?: string; phone?: string; isActive?: boolean }
    }) => unwrap(api.members({ id }).patch(changes)),
    onSuccess: () => client.invalidateQueries({ queryKey: memberKeys.all }),
  })
}
