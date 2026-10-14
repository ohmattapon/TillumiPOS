import type { DiningTable } from '@pos/api/types'
import { LAYOUT_HEIGHT, LAYOUT_WIDTH } from '@pos/api/dining-table'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { tablesQuery, useCreateTable, useUpdateTable } from '../api'
import { moveRect, pixelsToUnits, resizeRect, type Rect } from '../lib/geometry'

type Drag = { id: number; mode: 'move' | 'resize'; startX: number; startY: number; origin: Rect } | null

function NewTableDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('tables')
  const { t: tc } = useTranslation()
  const [name, setName] = useState('')
  const create = useCreateTable()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() === '') return
    create.mutate(
      { name: name.trim(), zone: null, seats: 4 },
      {
        onSuccess: (saved) => {
          toast.success(t('toast.created', { name: saved.name }))
          onClose()
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('newTable.title')}</DialogTitle>
          <DialogDescription>{t('newTable.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="table-new-name">{t('details.name')}</Label>
            <Input
              id="table-new-name"
              className="h-10"
              value={name}
              maxLength={50}
              required
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {create.error && (
            <p role="alert" className="text-sm text-destructive">
              {create.error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" className="h-10" disabled={name.trim() === '' || create.isPending}>
              {t('details.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Details of the selected table: the form is keyed by the table so it starts from what is stored. */
function TableDetails({ table }: { table: DiningTable }) {
  const { t } = useTranslation('tables')
  const [name, setName] = useState(table.name)
  const [zone, setZone] = useState(table.zone ?? '')
  const [seats, setSeats] = useState(String(table.seats))
  const update = useUpdateTable()

  const seatCount = /^\d+$/.test(seats.trim()) ? Number(seats) : null
  const canSave = name.trim() !== '' && seatCount !== null && seatCount >= 1 && seatCount <= 99 && !update.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSave || seatCount === null) return
    update.mutate(
      { id: table.id, changes: { name: name.trim(), zone: zone.trim() || null, seats: seatCount } },
      { onSuccess: (saved) => toast.success(t('toast.updated', { name: saved.name })) },
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <div className="space-y-2">
        <Label htmlFor="table-name">{t('details.name')}</Label>
        <Input id="table-name" className="h-10" value={name} maxLength={50} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="table-zone">{t('details.zone')}</Label>
        <Input id="table-zone" className="h-10" value={zone} maxLength={50} onChange={(event) => setZone(event.target.value)} />
        <p className="text-xs text-muted-foreground">{t('details.zoneHint')}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="table-seats">{t('details.seats')}</Label>
        <Input
          id="table-seats"
          className="h-10 w-32 text-right tabular-nums"
          inputMode="numeric"
          value={seats}
          aria-invalid={seatCount === null}
          onChange={(event) => setSeats(event.target.value)}
        />
      </div>
      <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <span className="text-sm font-medium">{t('details.active')}</span>
        <Switch
          checked={table.isActive}
          onCheckedChange={(isActive) =>
            update.mutate({ id: table.id, changes: { isActive } }, { onError: (error) => toast.error(error.message) })
          }
        />
      </label>
      {update.error && (
        <p role="alert" className="text-sm text-destructive">
          {update.error.message}
        </p>
      )}
      <Button type="submit" className="h-10" disabled={!canSave}>
        {update.isPending ? t('details.saving') : t('details.save')}
      </Button>
    </form>
  )
}

/** Owner-only: lay the tables of the branch out like the room. */
export function TablesPage() {
  const { t } = useTranslation('tables')
  const { t: tc } = useTranslation()
  const tables = useQuery(tablesQuery)
  const update = useUpdateTable()
  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [drag, setDrag] = useState<Drag>(null)
  // While dragging, the table is drawn at the draft place; it is saved when the pointer is released.
  const [draft, setDraft] = useState<(Rect & { id: number }) | null>(null)
  const canvas = useRef<HTMLDivElement>(null)

  const all = tables.data ?? []
  const selected = all.find((table) => table.id === selectedId) ?? null

  const begin = (event: PointerEvent<HTMLElement>, table: DiningTable, mode: 'move' | 'resize') => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedId(table.id)
    setDrag({
      id: table.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: { x: table.x, y: table.y, width: table.width, height: table.height },
    })
  }

  const track = (event: PointerEvent<HTMLElement>) => {
    if (!drag || !canvas.current) return
    const box = canvas.current.getBoundingClientRect()
    const dx = pixelsToUnits(event.clientX - drag.startX, box.width, LAYOUT_WIDTH)
    const dy = pixelsToUnits(event.clientY - drag.startY, box.height, LAYOUT_HEIGHT)
    const next = drag.mode === 'move' ? moveRect(drag.origin, dx, dy) : resizeRect(drag.origin, dx, dy)
    setDraft({ id: drag.id, ...next })
  }

  const release = () => {
    if (drag && draft && draft.id === drag.id)
      update.mutate(
        { id: drag.id, changes: { x: draft.x, y: draft.y, width: draft.width, height: draft.height } },
        { onError: (error) => toast.error(error.message), onSettled: () => setDraft(null) },
      )
    else setDraft(null)
    setDrag(null)
  }

  return (
    <>
      <PageHeader title={t('title')} description={t('description', { items: tc('items', { count: all.length }) })}>
        <Button className="h-9 px-3" onClick={() => setAdding(true)}>
          <Plus />
          {t('add')}
        </Button>
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[1fr_20rem]">
        <div>
          {tables.error && <p className="mb-2 text-sm text-destructive">{tables.error.message}</p>}
          <div
            ref={canvas}
            aria-label={t('floor')}
            className="relative w-full touch-none overflow-hidden rounded-xl border bg-muted/40 select-none"
            style={{ aspectRatio: `${LAYOUT_WIDTH} / ${LAYOUT_HEIGHT}` }}
            onPointerMove={track}
            onPointerUp={release}
            onPointerCancel={release}
            onPointerDown={() => setSelectedId(null)}
          >
            {!tables.isPending && all.length === 0 && (
              <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-muted-foreground">
                {t('empty')}
              </p>
            )}
            {all.map((table) => {
              const place = draft && draft.id === table.id ? draft : table
              return (
                <div
                  key={table.id}
                  role="button"
                  tabIndex={0}
                  aria-label={table.name}
                  aria-pressed={selectedId === table.id}
                  onPointerDown={(event) => begin(event, table, 'move')}
                  onKeyDown={(event) => event.key === 'Enter' && setSelectedId(table.id)}
                  className={cn(
                    'absolute flex cursor-grab flex-col items-center justify-center overflow-hidden rounded-lg border-2 bg-background p-1 text-center text-sm leading-tight active:cursor-grabbing',
                    selectedId === table.id ? 'border-primary ring-3 ring-ring/50' : 'border-border',
                    !table.isActive && 'opacity-50',
                  )}
                  style={{
                    left: `${(place.x / LAYOUT_WIDTH) * 100}%`,
                    top: `${(place.y / LAYOUT_HEIGHT) * 100}%`,
                    width: `${(place.width / LAYOUT_WIDTH) * 100}%`,
                    height: `${(place.height / LAYOUT_HEIGHT) * 100}%`,
                  }}
                >
                  <span className="max-w-full truncate font-semibold">{table.name}</span>
                  <span className="max-w-full truncate text-xs text-muted-foreground">
                    {table.isActive ? t('seats', { count: table.seats }) : t('inactive')}
                  </span>
                  <span
                    aria-hidden
                    onPointerDown={(event) => begin(event, table, 'resize')}
                    className="absolute right-0 bottom-0 size-4 cursor-nwse-resize rounded-tl bg-primary/70"
                  />
                </div>
              )
            })}
          </div>
        </div>

        <Panel title={t('details.title')}>
          {selected ? (
            <TableDetails key={selected.id} table={selected} />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">{t('details.select')}</p>
          )}
        </Panel>
      </div>

      {adding && <NewTableDialog onClose={() => setAdding(false)} />}
    </>
  )
}
