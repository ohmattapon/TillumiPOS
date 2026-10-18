import { useQuery } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { SkeletonRows } from '@/components/Skeletons'
import { PaginationBar } from '@/components/PaginationBar'
import { useListPagination } from '@/hooks/use-list-pagination'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { meQuery, useAuthorization } from '@/features/auth'
import { useFormat } from '@/features/settings'
import { ApiError } from '@/lib/api'
import { selectedRegisterId, useRegisterSelectionStore } from '../store/register-selection'
import { QrRecoveryPanel } from './QrRecoveryPanel'
import { ShiftHistoryPanel } from './ShiftHistoryPanel'
import { ShiftSummaryView } from './ShiftSummaryView'
import { ShiftEntriesPanel } from './ShiftEntriesPanel'
import { checkoutModeQuery, currentShiftQuery, registersQuery, shiftQuery, useCancelClosing, useCloseShift, useCreateRegister, useOpenShift, useRecordCashMovement, useStartClosing, useUpdateRegister } from '../api'

export function ShiftsPage() {
  const { can } = useAuthorization()
  const { t } = useTranslation('shifts')
  const { money, date } = useFormat()
  const me = useQuery(meQuery).data
  const mode = useQuery(checkoutModeQuery)
  const registers = useQuery(registersQuery)
  const registerPaging = useListPagination('registers')
  const selections = useRegisterSelectionStore((state) => state.selections)
  const selectRegister = useRegisterSelectionStore((state) => state.select)
  const [openingAmount, setOpeningAmount] = useState('0')
  const [countedAmount, setCountedAmount] = useState('')
  const [differenceReason, setDifferenceReason] = useState('')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementReason, setMovementReason] = useState('')
  const [movementKind, setMovementKind] = useState<'cash_in' | 'cash_out'>('cash_in')
  const [newRegisterCode, setNewRegisterCode] = useState('')
  const [newRegisterName, setNewRegisterName] = useState('')
  const [registerNames, setRegisterNames] = useState<Record<number, string>>({})
  const [needsQrAcknowledgement, setNeedsQrAcknowledgement] = useState(false)
  const openCommandKey = useRef<string | null>(null)
  const movementCommandKey = useRef<string | null>(null)
  const rememberedRegisterId = selectedRegisterId(selections, me?.id)
  const currentId = (rememberedRegisterId && registers.data?.items.some((register) => register.id === rememberedRegisterId && register.isActive)
    ? rememberedRegisterId : registers.data?.items.find((register) => register.isActive)?.id) ?? null
  const current = useQuery({ ...currentShiftQuery(currentId ?? 0), enabled: currentId !== null })
  // Until the register and its shift are known, "no shift" would be a lie and would offer to open one.
  const shiftLoading = registers.isPending || (currentId !== null && current.isPending)
  const detailsId = current.data?.id
  const activeShift = useQuery({
    ...shiftQuery(detailsId ?? 0),
    enabled: detailsId !== undefined,
  })
  const open = useOpenShift()
  const startClosing = useStartClosing()
  const cancelClosing = useCancelClosing()
  const close = useCloseShift()
  const movement = useRecordCashMovement()
  const createRegister = useCreateRegister()
  const updateRegister = useUpdateRegister()
  const registerName = useMemo(() => registers.data?.items.find((item) => item.id === currentId)?.name ?? '', [registers.data, currentId])
  const error = [mode.error, registers.error, current.error, open.error, startClosing.error, cancelClosing.error, close.error, movement.error, createRegister.error, updateRegister.error].find(Boolean)
  const errorCode = error instanceof ApiError ? error.code : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t('title')} />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 md:p-6">
        {mode.data?.checkoutMode === 'legacy' && <p role="status" className="mx-auto w-full max-w-3xl rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{t('legacyMode')}</p>}
        <section className="mx-auto w-full max-w-3xl space-y-5 rounded-xl border bg-card p-5 shadow-sm">
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="shift-register">{t('register')}</Label>
            <Select
              value={currentId === null ? '' : String(currentId)}
              disabled={registers.isPending || currentId === null || !me}
              onValueChange={(value) => { if (value && me) selectRegister(me.id, Number(value)) }}
            >
              <SelectTrigger id="shift-register" className="h-11! w-full min-w-0">
                <SelectValue placeholder={t('chooseRegister')} />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {registers.data?.items.filter((item) => item.isActive).map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>{item.code} · {item.name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {shiftLoading ? (
            <div className="border-t pt-5">
              <SkeletonRows rows={3} />
            </div>
          ) : current.data ? (
            <div className="space-y-4 border-t pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{current.data.status === 'open' ? t('shiftOpen') : t('shiftClosing')}</p>
                  <p className="text-sm text-muted-foreground">{registerName} · {t('openedBy', { name: current.data.openedByName })}</p>
                </div>
                <p className="text-sm text-muted-foreground">{date.dateTime(current.data.openedAt)}</p>
              </div>
              {current.data.status === 'open' && (
                <form className="grid gap-3 rounded-lg bg-muted/60 p-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => {
                  event.preventDefault()
                  const amountSatang = money.parse(movementAmount)
                  if (amountSatang && current.data) {
                    movementCommandKey.current ??= crypto.randomUUID()
                    movement.mutate({ id: current.data.id, kind: movementKind, amountSatang, reason: movementReason, idempotencyKey: movementCommandKey.current }, {
                      onSuccess: () => { movementCommandKey.current = null; setMovementAmount(''); setMovementReason('') },
                    })
                  }
                }}>
                  <div className="grid min-w-0 gap-2">
                    <Label htmlFor="shift-movement-kind">{t('cashMovement')}</Label>
                    <Select value={movementKind} onValueChange={(value) => {
                      if (value === 'cash_in' || value === 'cash_out') {
                        movementCommandKey.current = null
                        setMovementKind(value)
                      }
                    }}>
                      <SelectTrigger id="shift-movement-kind" className="h-10! w-full min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectGroup>
                          <SelectItem value="cash_in">{t('cashIn')}</SelectItem>
                          <SelectItem value="cash_out">{t('cashOut')}</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="grid gap-2 text-sm font-medium">{t('amount')}<Input inputMode="decimal" value={movementAmount} onChange={(e) => { movementCommandKey.current = null; setMovementAmount(e.target.value) }} /></label>
                  <label className="grid gap-2 text-sm font-medium">{t('reason')}<Input value={movementReason} onChange={(e) => { movementCommandKey.current = null; setMovementReason(e.target.value) }} /></label>
                  <Button type="submit" variant="outline" className="h-10 md:col-span-3" disabled={movement.isPending || !movementReason.trim() || money.parse(movementAmount) === null}>{t('saveMovement')}</Button>
                </form>
              )}
              {activeShift.data?.status === 'closing' && (activeShift.data.closingStartedById === me?.id || can('shifts.override')) && (
                <div className="space-y-3 rounded-lg bg-muted/60 p-4">
                  <ShiftSummaryView shiftId={activeShift.data.id} currency={activeShift.data.currency} />
                  <p className="text-sm">{t('expected')}: <strong className="tabular-nums">{money.format(activeShift.data.closingExpectedCashSatang ?? 0)}</strong></p>
                  <label className="grid gap-2 text-sm font-medium">{t('countedCash')}<Input inputMode="decimal" value={countedAmount} onChange={(e) => setCountedAmount(e.target.value)} /></label>
                  {money.parse(countedAmount) !== null && money.parse(countedAmount) !== activeShift.data.closingExpectedCashSatang && <label className="grid gap-2 text-sm font-medium">{t('differenceReason')}<Input value={differenceReason} onChange={(e) => setDifferenceReason(e.target.value)} /></label>}
                  <div className="flex gap-2"><Button variant="outline" className="h-11 flex-1" disabled={cancelClosing.isPending} onClick={() => cancelClosing.mutate({ id: current.data!.id, closingRevision: activeShift.data!.closingRevision })}>{t('cancelCounting')}</Button><Button className="h-11 flex-1" disabled={close.isPending || money.parse(countedAmount) === null || (money.parse(countedAmount) !== activeShift.data.closingExpectedCashSatang && !differenceReason.trim())} onClick={() => { const countedCashSatang = money.parse(countedAmount); if (countedCashSatang !== null) close.mutate({ id: current.data!.id, closingRevision: activeShift.data!.closingRevision, countedCashSatang, ...(differenceReason.trim() ? { reason: differenceReason.trim() } : {}) }) }}>{t('closeAction')}</Button></div>
                </div>
              )}
              {current.data.status === 'open' && !needsQrAcknowledgement && (
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={startClosing.isPending}
                  onClick={() => {
                    setCountedAmount('')
                    startClosing.mutate(
                      { id: current.data!.id },
                      {
                        // QRs are still waiting to be paid: counting may start, but only knowingly.
                        onError: (failure) => {
                          if (failure instanceof ApiError && failure.code === 'QR_PENDING_ACKNOWLEDGEMENT_REQUIRED') {
                            startClosing.reset()
                            setNeedsQrAcknowledgement(true)
                          }
                        },
                      },
                    )
                  }}
                >
                  {t('startCounting')}
                </Button>
              )}
              {current.data.status === 'open' && needsQrAcknowledgement && (
                <div role="alert" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                  <p>{t('qr.pendingWarning')}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="h-10" onClick={() => setNeedsQrAcknowledgement(false)}>
                      {t('qr.keepSelling')}
                    </Button>
                    <Button
                      className="h-10"
                      disabled={startClosing.isPending}
                      onClick={() =>
                        startClosing.mutate(
                          { id: current.data!.id, acknowledgePendingQr: true },
                          { onSuccess: () => setNeedsQrAcknowledgement(false) },
                        )
                      }
                    >
                      {t('qr.acknowledgeAndCount')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 border-t pt-5">
              <p className="text-sm text-muted-foreground">{t('noShift')}</p>
              <label className="grid gap-2 text-sm font-medium">{t('openingCash')}<Input inputMode="decimal" value={openingAmount} onChange={(e) => { openCommandKey.current = null; setOpeningAmount(e.target.value) }} /></label>
              <Button className="h-11" disabled={mode.data?.checkoutMode !== 'shifts' || currentId === null || open.isPending || money.parse(openingAmount) === null} onClick={() => { const openingCashSatang = money.parse(openingAmount); if (currentId !== null && openingCashSatang !== null) { openCommandKey.current ??= crypto.randomUUID(); open.mutate({ registerId: currentId, openingCashSatang, idempotencyKey: openCommandKey.current }, { onSuccess: () => { openCommandKey.current = null } }) } }}>{t('openAction')}</Button>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{errorCode ? t(`errors.${errorCode}`, { defaultValue: error.message }) : error.message || t('error')}</p>}
          {current.data && <ShiftEntriesPanel shiftId={current.data.id} />}
        </section>

        {mode.data?.checkoutMode === 'shifts' && <QrRecoveryPanel isOwner={can('qr.dismiss')} />}

        {can('registers.manage') && (
          <section className="mx-auto w-full max-w-3xl space-y-4 rounded-xl border bg-card p-5">
            <h2 className="font-semibold">{t('manageRegisters')}</h2>
            <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); createRegister.mutate({ code: newRegisterCode.trim().toUpperCase(), name: newRegisterName.trim() }, { onSuccess: () => { setNewRegisterCode(''); setNewRegisterName('') } }) }}>
              <label className="grid gap-2 text-sm">{t('registerCode')}<Input value={newRegisterCode} onChange={(event) => setNewRegisterCode(event.target.value.toUpperCase())} maxLength={20} pattern="[A-Z0-9-]+" required /></label>
              <label className="grid gap-2 text-sm">{t('registerName')}<Input value={newRegisterName} onChange={(event) => setNewRegisterName(event.target.value)} maxLength={100} required /></label>
              <Button className="h-10 self-end" disabled={createRegister.isPending}>{t('createRegister')}</Button>
            </form>
            {registers.isPending ? <SkeletonRows rows={3} /> : <ul className="divide-y">{registers.data?.items.slice(registerPaging.offset, registerPaging.offset + registerPaging.pageSize).map((register) => <li key={register.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm"><span className="font-medium">{register.code}</span><Input className="h-9 max-w-64" aria-label={t('registerName')} value={registerNames[register.id] ?? register.name} onChange={(event) => setRegisterNames((names) => ({ ...names, [register.id]: event.target.value }))} maxLength={100} /><div className="flex gap-2"><Button variant="outline" className="h-9" disabled={updateRegister.isPending || !(registerNames[register.id]?.trim()) || (registerNames[register.id]?.trim() ?? register.name) === register.name} onClick={() => updateRegister.mutate({ id: register.id, name: registerNames[register.id]!.trim() })}>{t('saveName')}</Button><Button variant="outline" className="h-9" disabled={updateRegister.isPending || (!!current.data && current.data.registerId === register.id)} onClick={() => updateRegister.mutate({ id: register.id, isActive: !register.isActive })}>{register.isActive ? t('deactivate') : t('activate')}</Button></div></li>)}</ul>}
            <PaginationBar {...registerPaging} total={registers.data?.total} isLoading={registers.isFetching} onPageChange={registerPaging.setPage} />
          </section>
        )}

        <ShiftHistoryPanel registers={registers.data?.items ?? []} />
      </main>
    </div>
  )
}
