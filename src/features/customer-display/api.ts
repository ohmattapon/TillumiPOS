import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import type { DisplayEnvelope } from './lib/display-state'

export const displayKeys = { all: ['customer-display'] as const }

/** The stream a screen listens to; EventSource needs the plain URL, not an Eden call. */
export const DISPLAY_STREAM_URL = '/api/v1/customer-display/stream'

const display = () => api['customer-display']

/** A screen asks for its own session; no sign-in, so it is a plain call and not a till query. */
export const startDisplaySession = () => unwrap(display().sessions.post())

/** The till puts its latest state on the server. A failure only means the screens wait for the next one. */
export const publishDisplayState = (registerId: number | undefined, envelope: DisplayEnvelope) =>
  unwrap(display().state.put({ registerId, envelope }))

const query = (registerId: number | undefined) => (registerId === undefined ? {} : { registerId })

/** The pictures for the customer screen: public, active-only and already ordered — the server decides. */
export const fetchDisplaySlides = () => unwrap(api['display-slides'].get())

/** How many screens follow this register now. */
export const displayPairingQuery = (registerId: number | undefined) =>
  queryOptions({
    queryKey: [...displayKeys.all, 'pairing', registerId ?? null],
    queryFn: () => unwrap(display().pair.get({ query: query(registerId) })),
  })

export function usePairDisplay(registerId: number | undefined) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => unwrap(display().pair.post({ code, registerId })),
    onSuccess: () => client.invalidateQueries({ queryKey: displayKeys.all }),
  })
}

export function useUnpairDisplay(registerId: number | undefined) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(display().pair.delete({ query: query(registerId) })),
    onSuccess: () => client.invalidateQueries({ queryKey: displayKeys.all }),
  })
}
