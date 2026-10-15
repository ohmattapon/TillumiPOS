import type { KitchenStation } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Panel'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { kitchenStationsQuery, useCreateKitchenStation, useUpdateKitchenStation } from '../api'

/** The longest station name the API accepts. */
const MAX_NAME_LENGTH = 50
const PAUSE_WARNING_ID = 'kitchen-pause-warning'

function NewStationDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('kitchen')
  const { t: tc } = useTranslation()
  const [name, setName] = useState('')
  const [sortOrder, setSortOrder] = useState('')
  const create = useCreateKitchenStation()

  // An empty order is left out, so the API uses its default (0). A value that is not a whole number is null.
  const order = sortOrder.trim() === '' ? undefined : /^\d{1,6}$/.test(sortOrder.trim()) ? Number(sortOrder) : null
  const canSave = name.trim() !== '' && order !== null && !create.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSave || order === null) return
    create.mutate(
      { name: name.trim(), sortOrder: order },
      {
        onSuccess: (saved) => {
          toast.success(t('stationCreated', { name: saved.name }))
          onClose()
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col gap-0 p-0 sm:max-w-sm">
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle>{t('addStation')}</DialogTitle>
            <DialogDescription>{t('stationDescription')}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
            <div className="space-y-2">
              <Label htmlFor="kitchen-station-name">{t('stationName')}</Label>
              <Input
                id="kitchen-station-name"
                className="h-11"
                value={name}
                maxLength={MAX_NAME_LENGTH}
                required
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kitchen-station-order">{t('sortOrder')}</Label>
              <Input
                id="kitchen-station-order"
                className="h-11 w-32 text-right tabular-nums"
                inputMode="numeric"
                value={sortOrder}
                aria-invalid={order === null}
                onChange={(event) => setSortOrder(event.target.value)}
              />
            </div>
            {create.error && (
              <p role="alert" className="text-sm text-destructive">
                {create.error.message}
              </p>
            )}
          </div>
          <DialogFooter className="mx-0 mb-0 shrink-0 px-6 py-4">
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" className="h-11" disabled={!canSave}>
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Owner-only: add the stations of the kitchen and pause or reopen them. */
export function KitchenStationsPage() {
  const { t } = useTranslation('kitchen')
  const stations = useQuery(kitchenStationsQuery)
  const update = useUpdateKitchenStation()
  const [adding, setAdding] = useState(false)

  const setActive = (station: KitchenStation, isActive: boolean) =>
    update.mutate({ id: station.id, changes: { isActive } }, { onError: (error) => toast.error(error.message) })

  return (
    <>
      <PageHeader title={t('stationsTitle')}>
        <Button className="h-11 px-3" onClick={() => setAdding(true)}>
          <Plus />
          {t('addStation')}
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Panel title={t('stations')}>
          {stations.error && <p role="alert" className="p-4 text-sm text-destructive">{stations.error.message}</p>}
          <p id={PAUSE_WARNING_ID} className="border-b px-4 py-3 text-sm text-muted-foreground">
            {t('pauseWarning')}
          </p>
          <DataTable
            rows={stations.data ?? []}
            rowKey={(station) => station.id}
            isPending={stations.isPending}
            empty={t('stationsEmpty')}
            muted={(station) => !station.isActive}
            columns={[
              { id: 'name', header: t('stationName'), priority: 'primary', cell: (station) => station.name },
              { id: 'sortOrder', header: t('sortOrder'), priority: 'secondary', className: 'tabular-nums', cell: (station) => station.sortOrder },
              {
                id: 'status',
                header: t('status'),
                priority: 'secondary',
                cell: (station) => (
                  <StatusBadge tone={station.isActive ? 'success' : 'neutral'}>
                    {station.isActive ? t('active') : t('paused')}
                  </StatusBadge>
                ),
              },
              {
                id: 'availability',
                header: t('availability'),
                priority: 'primary',
                cell: (station) => (
                  <label className="flex h-11 items-center gap-3 text-sm font-normal">
                    <Switch
                      checked={station.isActive}
                      disabled={update.isPending && update.variables?.id === station.id}
                      aria-describedby={PAUSE_WARNING_ID}
                      onCheckedChange={(isActive) => setActive(station, isActive)}
                    />
                    {t('active')}
                  </label>
                ),
              },
            ]}
          />
        </Panel>
      </div>

      {adding && <NewStationDialog onClose={() => setAdding(false)} />}
    </>
  )
}
