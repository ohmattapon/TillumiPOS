import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'

/** The shape of the signed-in screen (sidebar, title bar, content), shown while we find out who is signed in. */
export function AppSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy="true" className="flex h-svh bg-canvas">
      <span className="sr-only">{t('loading')}</span>
      <aside className="hidden w-64 shrink-0 space-y-6 border-r bg-sidebar p-4 sm:block" aria-hidden>
        <Skeleton className="h-8 w-36" />
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col" aria-hidden>
        <div className="flex h-16 items-center gap-3 border-b bg-background px-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        {/* Placeholders sit on white cards, as the real content does; bare grey would vanish on the canvas. */}
        <div className="grid grid-cols-2 gap-4 p-4 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-32" />
            </div>
          ))}
        </div>
        <div className="p-4">
          <div className="space-y-4 rounded-xl border bg-card p-4 shadow-xs">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
