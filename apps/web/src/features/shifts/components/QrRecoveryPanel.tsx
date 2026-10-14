import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PaginationBar } from '@/components/PaginationBar'
import { useListPagination } from '@/hooks/use-list-pagination'
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
  const attemptPaging = useListPagination('qr-attempts', 10)
  const paymentPaging = useListPagination('qr-unclaimed', 10)
  const attempts = useQuery(unresolvedQrAttemptsQuery({ limit: attemptPaging.pageSize, offset: attemptPaging.offset }))
  const unclaimed = useQuery(unclaimedQrQuery({ limit: paymentPaging.pageSize, offset: paymentPaging.offset }))
  const resolve = useResolveQrAttempt()
  const dismiss = useDismissQrPayment()
  const [dismissing, setDismissing] = useState<{ id: number; reason: string } | null>(null)

  const pendingAttempts = attempts.data?.items ?? []
  const payments = unclaimed.data?.items ?? []
  if (attempts.data?.total === 0 && unclaimed.data?.total === 0 && !attempts.error && !unclaimed.error && attemptPaging.page === 0 && paymentPaging.page === 0) return null

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

      {attempts.error && <p role="alert" className="text-sm text-destructive">{attempts.error.message}</p>}
      {unclaimed.error && <p role="alert" className="text-sm text-destructive">{unclaimed.error.message}</p>}
      {(attempts.isPending || (attempts.data?.total ?? 0) > 0 || attemptPaging.page > 0) && (
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
          <PaginationBar {...attemptPaging} total={attempts.data?.total} isLoading={attempts.isFetching || resolve.isPending} onPageChange={attemptPaging.setPage} />
        </div>
      )}

      {(unclaimed.isPending || (unclaimed.data?.total ?? 0) > 0 || paymentPaging.page > 0) && (
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
          <PaginationBar {...paymentPaging} total={unclaimed.data?.total} isLoading={unclaimed.isFetching || dismiss.isPending} onPageChange={(page) => { setDismissing(null); paymentPaging.setPage(page) }} />
        </div>
      )}
    </section>
  )
}
