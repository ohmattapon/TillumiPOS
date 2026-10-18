import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiV2, unwrap } from '@/lib/api'

export const shiftKeys = {
  all: ['shifts'] as const,
  registers: () => [...shiftKeys.all, 'registers'] as const,
  current: (registerId: number) => [...shiftKeys.all, 'current', registerId] as const,
  history: (filters: object = {}) => [...shiftKeys.all, 'history', filters] as const,
  summary: (id: number) => [...shiftKeys.all, 'summary', id] as const,
  detail: (id: number) => [...shiftKeys.all, 'detail', id] as const,
  entries: (id: number, filters: object = {}) => [...shiftKeys.all, 'entries', id, filters] as const,
  qrAttempts: (filters: object = {}) => [...shiftKeys.all, 'qr', 'attempts', filters] as const,
  qrUnclaimed: (filters: object = {}) => [...shiftKeys.all, 'qr', 'unclaimed', filters] as const,
}

export const registersQuery = queryOptions({
  queryKey: shiftKeys.registers(),
  queryFn: () => unwrap(apiV2.registers.get()),
  staleTime: 30_000,
})

export const checkoutModeQuery = queryOptions({
  queryKey: ['checkout-mode'] as const,
  queryFn: () => unwrap(apiV2.capabilities.get()),
  staleTime: 60_000,
})

export const currentShiftQuery = (registerId: number) => queryOptions({
  queryKey: shiftKeys.current(registerId),
  queryFn: () => unwrap(apiV2.registers({ id: registerId })['current-shift'].get()),
  refetchInterval: 5_000,
  refetchOnWindowFocus: true,
})

export type ShiftStatusFilter = 'all' | 'open' | 'closing' | 'closed'

export interface ShiftHistoryFilters {
  registerId: number | null
  status: ShiftStatusFilter
  limit: number
  offset: number
}

/** One page of the branch's shifts, newest first. */
export const shiftHistoryQuery = (filters: ShiftHistoryFilters) => queryOptions({
  queryKey: shiftKeys.history(filters),
  queryFn: () => unwrap(apiV2.shifts.get({
    query: {
      limit: filters.limit,
      offset: filters.offset,
      ...(filters.registerId !== null && { registerId: filters.registerId }),
      ...(filters.status !== 'all' && { status: filters.status }),
    },
  })),
})

/** The report of a shift: live while it is open, frozen from when counting started. */
/** One shift with its closing state, kept fresh because another till may be counting it. */
export const shiftQuery = (id: number) => queryOptions({
  queryKey: shiftKeys.detail(id),
  queryFn: () => unwrap(apiV2.shifts({ id }).get()),
  refetchInterval: 5_000,
  refetchOnWindowFocus: true,
})

export const shiftSummaryQuery = (id: number) => queryOptions({
  queryKey: shiftKeys.summary(id),
  queryFn: () => unwrap(apiV2.shifts({ id }).summary.get()),
})

export function useCreateRegister() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { code: string; name: string }) => unwrap(apiV2.registers.post(input)),
    onSuccess: () => client.invalidateQueries({ queryKey: shiftKeys.registers() }),
  })
}

export function useUpdateRegister() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: number; name?: string; isActive?: boolean }) =>
      unwrap(apiV2.registers({ id: input.id }).patch({ name: input.name, isActive: input.isActive })),
    onSuccess: () => client.invalidateQueries({ queryKey: shiftKeys.registers() }),
  })
}

export const shiftEntriesQuery = (shiftId: number, filters: { limit?: number; offset?: number } = {}) => queryOptions({
  queryKey: shiftKeys.entries(shiftId, filters),
  queryFn: () => unwrap(apiV2.shifts({ id: shiftId })['cash-entries'].get({ query: { limit: 20, offset: 0, ...filters } })),
})

function invalidateShifts(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: shiftKeys.all })
}

export function useOpenShift() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ idempotencyKey, ...input }: { registerId: number; openingCashSatang: number; openingNote?: string; idempotencyKey: string }) =>
      unwrap(apiV2.shifts.post(input, { headers: { 'idempotency-key': idempotencyKey } })),
    onSuccess: () => invalidateShifts(client),
  })
}

export function useStartClosing() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, acknowledgePendingQr }: { id: number; acknowledgePendingQr?: boolean }) =>
      unwrap(apiV2.shifts({ id })['start-closing'].post(acknowledgePendingQr ? { acknowledgePendingQr } : {}, { headers: { 'idempotency-key': crypto.randomUUID() } })),
    onSuccess: () => invalidateShifts(client),
  })
}

export function useCloseShift() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: number; closingRevision: number; countedCashSatang: number; reason?: string }) =>
      unwrap(apiV2.shifts({ id: input.id }).close.post({ closingRevision: input.closingRevision, countedCashSatang: input.countedCashSatang, reason: input.reason }, { headers: { 'idempotency-key': crypto.randomUUID() } })),
    onSuccess: () => invalidateShifts(client),
  })
}

export function useCancelClosing() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: number; closingRevision: number }) =>
      unwrap(apiV2.shifts({ id: input.id })['cancel-closing'].post({ closingRevision: input.closingRevision }, { headers: { 'idempotency-key': crypto.randomUUID() } })),
    onSuccess: () => invalidateShifts(client),
  })
}

export function useRecordCashMovement() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ idempotencyKey, ...input }: { id: number; kind: 'cash_in' | 'cash_out'; amountSatang: number; reason: string; idempotencyKey: string }) =>
      unwrap(apiV2.shifts({ id: input.id })['cash-entries'].post({ kind: input.kind, amountSatang: input.amountSatang, reason: input.reason }, { headers: { 'idempotency-key': idempotencyKey } })),
    onSuccess: () => invalidateShifts(client),
  })
}

/** QR requests whose outcome at the bank was never learned. They block counting until resolved. */
export const unresolvedQrAttemptsQuery = (filters: { limit?: number; offset?: number } = {}) => queryOptions({
  queryKey: shiftKeys.qrAttempts(filters),
  queryFn: () => unwrap(apiV2.payments.qr.attempts.get({ query: { limit: 10, offset: 0, ...filters } })),
  refetchInterval: 15_000,
})

/** Money the bank confirmed that has no sale yet, for the whole branch. */
export const unclaimedQrQuery = (filters: { limit?: number; offset?: number; amountSatang?: number } = {}) => queryOptions({
  queryKey: shiftKeys.qrUnclaimed(filters),
  queryFn: () => unwrap(apiV2.payments.qr.unclaimed.get({ query: { limit: 10, offset: 0, ...filters } })),
  refetchInterval: 15_000,
})

export function useResolveQrAttempt() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => unwrap(apiV2.payments.qr.attempts({ id }).resolve.post()),
    onSettled: () => invalidateShifts(client),
  })
}

export function useDismissQrPayment() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => unwrap(apiV2.payments.qr({ id }).dismiss.post({ reason })),
    onSuccess: () => invalidateShifts(client),
  })
}
