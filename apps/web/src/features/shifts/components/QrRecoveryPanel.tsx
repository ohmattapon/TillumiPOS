import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFormat } from '@/features/settings'
import { unclaimedQrQuery, unresolvedQrAttemptsQuery, useDismissQrPayment, useResolveQrAttempt } from '../api'

/**
 * Bank QR business that still needs a person: requests whose outcome was never learned, and money the
 * bank confirmed that has no sale yet. It lives on the shift page, not in the payment dialog, so it is
 * still there after a reload, a sign-out or a closed shift. Shown only when there is something to do.
 */
export function QrRecoveryPanel({ isOwner }: { isOwner: boolean }) {
  const { t } = useTranslation('shifts')
  const { money, date } = useFormat()
  const attempts = useQuery(unresolvedQrAttemptsQuery)
  const unclaimed = useQuery(unclaimedQrQuery)
  const resolve = useResolveQrAttempt()
  const dismiss = useDismissQrPayment()
  const [dismissing, setDismissing] = useState<{ id: number; reason: string } | null>(null)

  const pendingAttempts = attempts.data?.items ?? []
  const payments = unclaimed.data?.items ?? []
  if (pendingAttempts.length === 0 && payments.length === 0) return null

  const confirmDismiss = (event: FormEvent) => {
    event.preventDefault()
    if (!dismissing) return
    dismiss.mutate(
      { id: dismissing.id, reason: dismissing.reason.trim() },
      {
        onSuccess: () => {
          toast.success(t('qr.dismissed'))
          setDismissing(null)
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 rounded-xl border border-amber-300 bg-card p-5">
      <div>
        <h2 className="font-semibold">{t('qr.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('qr.description')}</p>
      </div>

      {pendingAttempts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t('qr.attemptsTitle')}</h3>
          <ul className="divide-y rounded-lg border">
            {pendingAttempts.map((attempt) => (
              <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium tabular-nums">{money.format(attempt.amountSatang)}</p>
                  <p className="text-xs text-muted-foreground">
                    {attempt.actorName} · {date.dateTime(attempt.createdAt)} · {attempt.reference}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="h-10"
                  disabled={resolve.isPending}
                  onClick={() =>
                    resolve.mutate(attempt.id, {
                      onSuccess: (resolved) =>
                        toast.success(resolved.state === 'ready' ? t('qr.resolvedPaid') : t('qr.resolvedNone')),
                      onError: (error) => toast.error(error.message),
                    })
                  }
                >
                  {t('qr.resolve')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {payments.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t('qr.unclaimedTitle')}</h3>
          <p className="text-xs text-muted-foreground">{t('qr.unclaimedHint')}</p>
          <ul className="divide-y rounded-lg border">
            {payments.map((payment) => (
              <li key={payment.id} className="space-y-3 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium tabular-nums">{money.format(payment.amountSatang)}</p>
                    <p className="text-xs text-muted-foreground">
                      {payment.payerName ?? t('qr.unknownPayer')}
                      {payment.paidAt ? ` · ${date.dateTime(payment.paidAt)}` : ''} · {payment.reference}
                    </p>
                  </div>
                  {isOwner && dismissing?.id !== payment.id && (
                    <Button variant="outline" className="h-10" onClick={() => setDismissing({ id: payment.id, reason: '' })}>
                      {t('qr.dismiss')}
                    </Button>
                  )}
                </div>
                {dismissing?.id === payment.id && (
                  <form onSubmit={confirmDismiss} className="flex flex-wrap items-center gap-2">
                    <Input
                      className="h-10 min-w-48 flex-1"
                      value={dismissing.reason}
                      onChange={(event) => setDismissing({ id: payment.id, reason: event.target.value })}
                      placeholder={t('qr.dismissPlaceholder')}
                      aria-label={t('qr.dismissReason')}
                      maxLength={500}
                      required
                      autoFocus
                    />
                    <Button type="button" variant="outline" className="h-10" onClick={() => setDismissing(null)}>
                      {t('qr.keep')}
                    </Button>
                    <Button
                      type="submit"
                      variant="destructive"
                      className="h-10"
                      disabled={dismissing.reason.trim() === '' || dismiss.isPending}
                    >
                      {t('qr.confirmDismiss')}
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
