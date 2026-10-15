import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { kitchenStationsQuery, kitchenTicketsQuery, useMarkTicketDone } from '../api'
import { defaultStationId } from '../lib/stations'
import { TicketCard } from './TicketCard'

/** The kitchen screen: one station at a time, its open tickets oldest first, refreshed by the query. */
export function KitchenBoardPage() {
  const { t } = useTranslation('kitchen')
  const [params, setParams] = useSearchParams()
  const stations = useQuery(kitchenStationsQuery)
  const all = stations.data ?? []
  // Every station is a tab: pausing a station stops new tickets only, so its open tickets must stay visible and completable.
  const chosen = defaultStationId(all, Number(params.get('station')))
  const tickets = useQuery({ ...kitchenTicketsQuery(chosen), enabled: chosen > 0 })
  const markDone = useMarkTicketDone()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t('title')} />

      {stations.isPending && <Skeleton className="m-4 h-11 w-64" />}
      {stations.error && <p role="alert" className="p-4 text-sm text-destructive">{stations.error.message}</p>}
      {!stations.isPending && !stations.error && all.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">{t('noStations')}</p>
      )}

      {all.length > 0 && (
        <nav aria-label={t('stations')} className="flex flex-wrap gap-2 px-4 pt-3 pb-2">
          {all.map((station) => (
            <Button
              key={station.id}
              variant={station.id === chosen ? 'default' : 'outline'}
              className="h-11"
              aria-pressed={station.id === chosen}
              onClick={() => setParams({ station: String(station.id) })}
            >
              {station.isActive ? station.name : t('stationPaused', { name: station.name })}
            </Button>
          ))}
        </nav>
      )}

      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4 sm:grid-cols-2 xl:grid-cols-3">
        {tickets.error && <p role="alert" className="col-span-full text-sm text-destructive">{tickets.error.message}</p>}
        {tickets.isPending && chosen > 0 && <Skeleton className="h-48 w-full" />}
        {tickets.data?.length === 0 && <p className="col-span-full py-16 text-center text-sm text-muted-foreground">{t('noTickets')}</p>}
        {tickets.data?.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            disabled={markDone.isPending}
            onDone={() => markDone.mutate(ticket.id, { onError: (error) => toast.error(error.message) })}
          />
        ))}
      </div>
    </div>
  )
}
