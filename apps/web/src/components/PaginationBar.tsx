import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getPageItems } from './lib/get-page-items'

interface Props {
  page: number
  pageSize: number
  total?: number
  isLoading?: boolean
  onPageChange: (page: number) => void
}

/** Shared navigation for server pages and short catalogue lists. Page numbers here are zero based. */
export function PaginationBar({ page, pageSize, total, isLoading = false, onPageChange }: Props) {
  const { t } = useTranslation()
  const pages = Math.max(1, Math.ceil((total ?? 0) / pageSize))
  const last = pages - 1

  // A cancellation, dismissal or changed stock can remove the last row of the current page.
  useEffect(() => {
    if (!isLoading && total !== undefined && page > last) onPageChange(last)
  }, [isLoading, total, page, last, onPageChange])

  if (!isLoading && (total ?? 0) <= pageSize && page === 0) return null

  const pageText = t('pagination.page', { page: page + 1, pages: isLoading ? '…' : pages })
  const iconClass = 'h-11 w-11 max-sm:hidden'

  return (
    <nav aria-label={t('pagination.label')} aria-busy={isLoading} className="flex flex-wrap items-center justify-between gap-3 p-3">
      <p aria-live="polite" className="text-xs text-muted-foreground tabular-nums basis-full sm:basis-auto">
        {isLoading ? t('loading') : t('pagination.range', {
          from: total ? page * pageSize + 1 : 0,
          to: Math.min((page + 1) * pageSize, total ?? 0),
          total: total ?? 0,
        })}
      </p>
      <div className="ml-auto flex items-center gap-1">
        <Button type="button" variant="outline" size="sm" className={iconClass} aria-label={t('pagination.first')} disabled={isLoading || page === 0} onClick={() => onPageChange(0)}>
          <ChevronsLeft aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-11 w-11" aria-label={t('pagination.previous')} disabled={isLoading || page === 0} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft aria-hidden="true" />
        </Button>
        <div className="hidden items-center gap-1 sm:flex">
          {getPageItems(page, pages).map((item, index) => item === '…' ? (
            <span key={`ellipsis-${index}`} aria-hidden="true" className="px-1 text-xs text-muted-foreground">…</span>
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === page + 1 ? 'default' : 'ghost'}
              size="sm"
              className="h-11 min-w-11 tabular-nums"
              aria-label={t('pagination.goTo', { page: item })}
              aria-current={item === page + 1 ? 'page' : undefined}
              disabled={isLoading}
              onClick={() => onPageChange(item - 1)}
            >
              {item}
            </Button>
          ))}
        </div>
        <span className="px-2 text-xs tabular-nums sm:hidden">{pageText}</span>
        <Button type="button" variant="outline" size="sm" className="h-11 w-11" aria-label={t('pagination.next')} disabled={isLoading || page >= last} onClick={() => onPageChange(page + 1)}>
          <ChevronRight aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" size="sm" className={iconClass} aria-label={t('pagination.last')} disabled={isLoading || page >= last} onClick={() => onPageChange(last)}>
          <ChevronsRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  )
}
