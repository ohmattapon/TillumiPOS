import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { kitchenStationsQuery, kitchenTicketsQuery, useMarkTicketDone } from '../api'
import { TicketCard } from './TicketCard'

/** The kitchen screen: one station at a time, its open tickets oldest first, refreshed by the query. */
export function KitchenBoardPage() {
  const { t } = useTranslation('kitchen')
  const [params, setParams] = useSearchParams()
  const stations = useQuery(kitchenStationsQuery)
  const active = (stations.data ?? []).filter((station) => station.isActive)
  // A station in the address that is paused (or gone) is not on the screen, so the first open one is shown instead.
  const requested = Number(params.get('station'))
  const chosen = active.find((station) => station.id === requested)?.id ?? active[0]?.id ?? 0
  const tickets = useQuery({ ...kitchenTicketsQuery(chosen), enabled: chosen > 0 })
  const markDone = useMarkTicketDone()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t('title')} />

      {stations.isPending && <Skeleton className="m-4 h-11 w-64" />}
      {stations.error && <p role="alert" className="p-4 text-sm text-destructive">{stations.error.message}</p>}
      {!stations.isPending && !stations.error && active.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">{t('noStations')}</p>
      )}

      {active.length > 0 && (
        <nav aria-label={t('stations')} className="flex flex-wrap gap-2 px-4 pt-3 pb-2">
          {active.map((station) => (
            <Button
              key={station.id}
              variant={station.id === chosen ? 'default' : 'outline'}
              className="h-11"
              aria-pressed={station.id === chosen}
              onClick={() => setParams({ station: String(station.id) })}
            >
              {station.name}
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
