import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { barWidth } from '@/lib/skeleton'
import { cn } from '@/lib/utils'

/*
 * Placeholders drawn in the shape of the content they stand for, so a screen does not jump when the data
 * arrives. Each one is a status region: a screen reader announces "กำลังโหลด" once and the bars say nothing.
 */

function Status({ className, children }: { className?: string; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{t('loading')}</span>
      {children}
    </div>
  )
}

/** A list of rows, each a round mark and two lines of text. */
export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <Status className={className}>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className={cn('h-4', barWidth(index))} />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </Status>
  )
}

/** A card with a title row over a list, the shape of a `Panel`. */
export function SkeletonPanel({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <Status className={className}>
      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="space-y-2 border-b px-4 py-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
        <div className="divide-y">
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className={cn('h-4', barWidth(index))} />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </Status>
  )
}

/** A grid of product-style cards, with the picture area on top. The caller sets the grid columns. */
export function SkeletonCardGrid({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <Status className={className}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        </div>
      ))}
    </Status>
  )
}

/**
 * The four figures at the top of the day's sales, drawn as the same tiles. It is `display: contents`, so its
 * tiles become the cells of the caller's grid.
 */
export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <Status className="contents">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-2">
            <Skeleton className="size-7 rounded-md" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="mt-3 h-7 w-32" />
          <Skeleton className="mt-3 h-3 w-40" />
        </div>
      ))}
    </Status>
  )
}
