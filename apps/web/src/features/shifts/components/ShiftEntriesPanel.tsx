import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { PaginationBar } from '@/components/PaginationBar'
import { Skeleton } from '@/components/ui/skeleton'
import { useFormat } from '@/features/settings'
import { useListPagination } from '@/hooks/use-list-pagination'
import { shiftEntriesQuery } from '../api'

export function ShiftEntriesPanel({ shiftId }: { shiftId: number }) {
  const { t } = useTranslation('shifts')
  const { money, date } = useFormat()
  const paging = useListPagination(`entries:${shiftId}`)
  const entries = useQuery(shiftEntriesQuery(shiftId, { limit: paging.pageSize, offset: paging.offset }))

  return (
    <div className="border-t pt-4">
      <h3 className="mb-3 text-sm font-semibold">{t('entries')}</h3>
      {entries.error && <p role="alert" className="text-sm text-destructive">{entries.error.message}</p>}
      {entries.isPending ? <Skeleton className="h-24 w-full" /> : entries.data?.items.length ? (
        <ul className="divide-y">
          {entries.data.items.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span>{t(`entry_${entry.kind}`)}</span>
              <span className="font-medium tabular-nums">{money.format(entry.amountSatang)}</span>
              <span className="text-muted-foreground">{entry.actorName} · {date.dateTime(entry.createdAt)}{entry.reason ? ` · ${entry.reason}` : ''}</span>
            </li>
          ))}
        </ul>
      ) : !entries.error && <p className="text-sm text-muted-foreground">{t('noEntries')}</p>}
      <PaginationBar {...paging} total={entries.data?.total} isLoading={entries.isFetching} onPageChange={paging.setPage} />
    </div>
  )
}
