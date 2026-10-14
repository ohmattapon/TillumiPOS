import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

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

  return (
    <nav aria-label={t('pagination.label')} aria-busy={isLoading} className="flex flex-wrap items-center justify-between gap-3 p-3">
      <p aria-live="polite" className="text-xs text-muted-foreground tabular-nums">
        {isLoading ? t('loading') : t('pagination.range', {
          from: total ? page * pageSize + 1 : 0,
          to: Math.min((page + 1) * pageSize, total ?? 0),
          total: total ?? 0,
        })}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <Button type="button" variant="outline" size="sm" className="h-11" disabled={isLoading || page === 0} onClick={() => onPageChange(0)}>{t('pagination.first')}</Button>
        <Button type="button" variant="outline" size="sm" className="h-11" disabled={isLoading || page === 0} onClick={() => onPageChange(page - 1)}>{t('pagination.previous')}</Button>
        <span className="px-2 text-xs tabular-nums">{t('pagination.page', { page: page + 1, pages: isLoading ? '…' : pages })}</span>
        <Button type="button" variant="outline" size="sm" className="h-11" disabled={isLoading || page >= last} onClick={() => onPageChange(page + 1)}>{t('pagination.next')}</Button>
        <Button type="button" variant="outline" size="sm" className="h-11" disabled={isLoading || page >= last} onClick={() => onPageChange(last)}>{t('pagination.last')}</Button>
      </div>
    </nav>
  )
}
