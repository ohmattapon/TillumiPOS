import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { orderKeys } from '@/features/orders'
import { api, unwrap } from '@/lib/api'

export const kitchenKeys = {
  /** Prefix of every kitchen query. */
  all: ['kitchen'] as const,
  stations: () => [...kitchenKeys.all, 'stations'] as const,
  tickets: (stationId: number) => [...kitchenKeys.all, 'tickets', stationId] as const,
  routing: () => [...kitchenKeys.all, 'routing'] as const,
}

export const kitchenStationsQuery = queryOptions({
  queryKey: kitchenKeys.stations(),
  queryFn: async () => (await unwrap(api.catalog['kitchen-stations'].get())).items,
})

/** Which station each category goes to. A category missing here is not sent to the kitchen. */
export const kitchenRoutingQuery = queryOptions({
  queryKey: kitchenKeys.routing(),
  queryFn: async () => (await unwrap(api.catalog['kitchen-routing'].get())).items,
})

/** The open tickets of one station. Refetched every 3 seconds: the kitchen has no push channel. */
export const kitchenTicketsQuery = (stationId: number) =>
  queryOptions({
    queryKey: kitchenKeys.tickets(stationId),
    queryFn: async () => (await unwrap(api.kitchen.tickets.get({ query: { stationId, limit: 200 } }))).items,
    refetchInterval: 3_000,
  })

export function useMarkTicketDone() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => unwrap(api.kitchen.tickets({ id }).done.post()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: kitchenKeys.all }),
  })
}

/** Sends what has not gone yet. The order's sent counts change, so the order is refreshed too. */
export function useSendOrderToKitchen() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (orderId: number) => unwrap(api.orders({ id: orderId })['kitchen-send'].post()),
    onSuccess: (_result, orderId) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: kitchenKeys.all }),
        queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) }),
        queryClient.invalidateQueries({ queryKey: orderKeys.all }),
      ]),
  })
}

export function useCreateKitchenStation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { name: string; sortOrder?: number }) => unwrap(api.catalog['kitchen-stations'].post(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: kitchenKeys.stations() }),
  })
}

export function useUpdateKitchenStation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: { name?: string; sortOrder?: number; isActive?: boolean } }) =>
      unwrap(api.catalog['kitchen-stations']({ id }).patch(changes)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: kitchenKeys.stations() }),
  })
}

/**
 * Routes a category to a station, or with null takes it off the kitchen. Only the kitchen's own routing
 * is refreshed: the categories feature depends on this one, never the other way round.
 */
export function useSetCategoryStation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ categoryId, stationId }: { categoryId: number; stationId: number | null }) =>
      unwrap(api.catalog.categories({ id: categoryId })['kitchen-station'].put({ stationId })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: kitchenKeys.routing() }),
  })
}
