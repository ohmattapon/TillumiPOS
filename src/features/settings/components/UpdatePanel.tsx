import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { updateStatusQuery, useApplyUpdate } from '../api'

/**
 * Version status and the owner update flow. The whole settings page is already
 * owner-only (the route needs settings.write), so no extra gating here.
 * The browser only checks and stages: stopping Windows services needs an
 * elevated script on the shop machine (installer/scripts/apply-update.ps1),
 * which the staged message points at.
 */
export function UpdatePanel() {
  const { t } = useTranslation('settings')
  const status = useQuery(updateStatusQuery)
  const apply = useApplyUpdate()

  const checking = status.isPending || status.isFetching
  const info = status.data

  // Only the native Windows install can apply an update. Elsewhere the API says so without asking
  // the feed, and the panel stays out of the way. A failed check can only come from a native install.
  if (status.isPending || (info && !info.supported)) return null

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
      <h2 className="text-sm font-semibold">{t('update.title')}</h2>
      {status.error && (
        <p role="alert" className="text-sm text-destructive">
          {status.error.message || t('update.checkFailed')}
        </p>
      )}
      {info && (
        <div className="space-y-1 text-sm">
          <p className="tabular-nums">{t('update.current', { version: info.currentVersion })}</p>
          <p className="tabular-nums text-muted-foreground">{t('update.latest', { version: info.latestVersion })}</p>
          <p className={info.updateAvailable ? 'font-medium' : 'text-muted-foreground'}>
            {info.updateAvailable ? t('update.available') : t('update.upToDate')}
          </p>
        </div>
      )}
      {apply.data && (
        <p role="status" className="text-sm font-medium">
          {t('update.staged', { version: apply.data.version })}
        </p>
      )}
      {apply.error && (
        <p role="alert" className="text-sm text-destructive">
          {apply.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button className="h-10" variant="outline" disabled={checking} onClick={() => status.refetch()}>
          {checking ? t('update.checking') : t('update.check')}
        </Button>
        {info?.updateAvailable && (
          <Button className="h-10" disabled={apply.isPending} onClick={() => apply.mutate()}>
            {apply.isPending ? t('update.applying') : t('update.apply')}
          </Button>
        )}
      </div>
    </section>
  )
}
