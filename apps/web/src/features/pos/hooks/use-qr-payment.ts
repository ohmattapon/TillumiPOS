import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { QR_POLL_MS, qrPaymentQuery, useCancelQrPayment, useCreateQrPayment } from '../api'

interface IssuedQr {
  id: number
  /** Base64 PNG to show. Only the answer that created the QR carries it. */
  image: string
  expiresAt: Date
}

/**
 * One bank QR for an exact amount, from creating it to the bank confirming it. It starts when
 * `active` turns true, is polled every few seconds, and can be cancelled or replaced. `paid`
 * appears only when the bank itself has reported the money. With a `shiftId` the QR is asked for
 * on behalf of that open shift (the v2 contract); without one the legacy contract is used.
 */
export function useQrPayment({ amountSatang, quoteId, active, shiftId }: { amountSatang: number; quoteId?: number; active: boolean; shiftId?: number }) {
  const create = useCreateQrPayment()
  const cancelQr = useCancelQrPayment()
  const [issued, setIssued] = useState<IssuedQr | null>(null)
  const requested = useRef(false)

  const issue = useCallback(() => {
    requested.current = true
    setIssued(null)
    // A new key per QR: a lost answer is then resolved from the shift page, never by asking twice.
    create.mutate(
      { amountSatang, quoteId, shiftId, idempotencyKey: crypto.randomUUID() },
      { onSuccess: (qr) => setIssued({ id: qr.id, image: qr.qrImage, expiresAt: new Date(qr.expiresAt) }) },
    )
    // `create` is a stable mutation object per render; only the amount and shift decide a new QR.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountSatang, quoteId, shiftId])

  // Once per dialog: a re-render, or React's double effect in development, must not make a second QR.
  useEffect(() => {
    if (active && !requested.current) issue()
  }, [active, issue])

  const status = useQuery({
    ...qrPaymentQuery(issued?.id ?? 0, shiftId !== undefined),
    enabled: issued !== null,
    refetchInterval: (query) => (query.state.data?.status === 'pending' || !query.state.data ? QR_POLL_MS : false),
    // A transient failure of the poll must not look like a failed payment: keep waiting.
    retry: true,
  })

  const state = status.data?.status
  const payment = status.data
  const inShift = shiftId !== undefined
  // The QR on screen is cancelled before its price is used again. Nothing to cancel once it is paid or gone.
  const cancelIssued = async () => {
    if (issued && state !== 'paid') await cancelQr.mutateAsync({ id: issued.id, inShift })
  }

  return {
    /** The QR is being asked for from the bank. */
    isCreating: create.isPending,
    createError: create.error,
    issued,
    /** Set once the bank has confirmed the money. */
    paid: state === 'paid' && payment ? { id: payment.id, payerName: payment.payerName } : null,
    isWaiting: issued !== null && (state === undefined || state === 'pending'),
    /**
     * Stops waiting. Resolves to whether the QR is cancelled. A payment made next waits for that, because its
     * price stays reserved until then. A payment that has already arrived is left alone (the server refuses to cancel it).
     */
    cancel: () => cancelIssued().then(() => true, () => false),
    /** A cancel is on its way: a payment made now would meet the price the QR still holds. */
    isCancelling: cancelQr.isPending,
    cancelError: cancelQr.error,
  }
}
