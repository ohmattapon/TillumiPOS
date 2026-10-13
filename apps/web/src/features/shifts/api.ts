import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiV2, unwrap } from '@/lib/api'

export const shiftKeys = {
  all: ['shifts'] as const,
  registers: () => [...shiftKeys.all, 'registers'] as const,
  current: (registerId: number) => [...shiftKeys.all, 'current', registerId] as const,
  history: () => [...shiftKeys.all, 'history'] as const,
  detail: (id: number) => [...shiftKeys.all, 'detail', id] as const,
  entries: (id: number) => [...shiftKeys.all, 'entries', id] as const,
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

export const shiftHistoryQuery = queryOptions({
  queryKey: shiftKeys.history(),
  queryFn: () => unwrap(apiV2.shifts.get({ query: { limit: 50, offset: 0 } })),
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

export const shiftEntriesQuery = (shiftId: number) => queryOptions({
  queryKey: shiftKeys.entries(shiftId),
  queryFn: () => unwrap(apiV2.shifts({ id: shiftId })['cash-entries'].get({ query: { limit: 50, offset: 0 } })),
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
    mutationFn: (id: number) => unwrap(apiV2.shifts({ id })['start-closing'].post({}, { headers: { 'idempotency-key': crypto.randomUUID() } })),
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
