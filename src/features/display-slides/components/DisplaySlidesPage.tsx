import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, Plus } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Panel'
import { StatusBadge } from '@/components/StatusBadge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { slidesQuery, useDeleteSlide, useUpdateSlide, useUploadSlide, type DisplaySlide } from '../api'
import { sortSlides, validateSlideFile } from '../lib/slides'

function OrderDialog({ slide, onClose }: { slide: DisplaySlide; onClose: () => void }) {
  const { t } = useTranslation('displaySlides')
  const { t: tc } = useTranslation()
  const [sortOrder, setSortOrder] = useState(String(slide.sortOrder))
  const update = useUpdateSlide()

  const order = /^\d{1,6}$/.test(sortOrder.trim()) ? Number(sortOrder.trim()) : null
  const canSave = order !== null && !update.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSave || order === null) return
    update.mutate(
      { id: slide.id, changes: { sortOrder: order } },
      {
        onSuccess: () => {
          toast.success(t('toast.updated'))
          onClose()
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('form.titleOrder')}</DialogTitle>
          <DialogDescription>{t('form.descriptionOrder')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slide-order">{t('form.sortOrder')}</Label>
            <Input
              id="slide-order"
              className="h-11 w-32 text-right tabular-nums"
              inputMode="numeric"
              value={sortOrder}
              aria-invalid={order === null}
              onChange={(event) => setSortOrder(event.target.value)}
            />
          </div>

          {update.error && (
            <p role="alert" className="text-sm text-destructive">
              {update.error.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" className="h-11" disabled={!canSave}>
              {update.isPending ? t('form.saving') : t('form.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Owner-only: manages the pictures shown in rotation on the customer display. */
export function DisplaySlidesPage() {
  const { t } = useTranslation('displaySlides')
  const slides = useQuery(slidesQuery)
  const upload = useUploadSlide()
  const update = useUpdateSlide()
  const remove = useDeleteSlide()
  const fileInput = useRef<HTMLInputElement>(null)
  const [orderSlide, setOrderSlide] = useState<DisplaySlide | null>(null)
  const [deleteSlide, setDeleteSlide] = useState<DisplaySlide | null>(null)

  const all = sortSlides(slides.data?.items ?? [])

  const pickFile = () => fileInput.current?.click()

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0]
    // Always reset so picking the same file again still fires a change.
    event.target.value = ''
    if (!picked) return
    const problem = validateSlideFile(picked)
    if (problem === 'type') {
      toast.error(t('error.invalidType'))
      return
    }
    if (problem === 'size') {
      toast.error(t('error.tooLarge'))
      return
    }
    upload.mutate(picked, {
      onSuccess: () => toast.success(t('toast.uploaded')),
      onError: (error) => toast.error(error.message),
    })
  }

  const setActive = (slide: DisplaySlide, isActive: boolean) =>
    update.mutate(
      { id: slide.id, changes: { isActive } },
      {
        onSuccess: () => toast.success(t(isActive ? 'toast.activated' : 'toast.deactivated')),
        onError: (error) => toast.error(error.message),
      },
    )

  const confirmDelete = () => {
    if (!deleteSlide) return
    remove.mutate(deleteSlide.id, {
      onSuccess: () => {
        toast.success(t('toast.deleted'))
        setDeleteSlide(null)
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <>
      <PageHeader title={t('title')} description={t('description')}>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={onFileChange}
        />
        <Button className="h-11 px-3" onClick={pickFile} disabled={upload.isPending}>
          <Plus />
          {t('upload')}
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Panel title={t('list.title')} description={t('list.description')}>
          {slides.error && (
            <p role="alert" className="p-4 text-sm text-destructive">
              {slides.error.message}
              <Button variant="link" className="h-11" onClick={() => void slides.refetch()}>{t('retry')}</Button>
            </p>
          )}
          {!slides.error && (
            <DataTable
              rows={all}
              rowKey={(slide) => slide.id}
              isPending={slides.isPending}
              empty={t('list.empty')}
              muted={(slide) => !slide.isActive}
              columns={[
                {
                  id: 'preview',
                  header: t('columns.preview'),
                  priority: 'primary',
                  cell: (slide) =>
                    slide.imageUrl ? (
                      <img src={slide.imageUrl} alt="" className="h-14 w-24 rounded-md bg-muted object-contain" loading="lazy" />
                    ) : (
                      <span>{t('columns.noImage')}</span>
                    ),
                },
                {
                  id: 'sortOrder',
                  header: t('columns.sortOrder'),
                  priority: 'secondary',
                  align: 'right',
                  cell: (slide) => slide.sortOrder,
                },
                {
                  id: 'status',
                  header: t('columns.status'),
                  priority: 'secondary',
                  cell: (slide) => (
                    <StatusBadge tone={slide.isActive ? 'success' : 'neutral'}>
                      {slide.isActive ? t('status.active') : t('status.inactive')}
                    </StatusBadge>
                  ),
                },
              ]}
              actions={(slide) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="size-11" aria-label={t('actions.more', { order: slide.sortOrder })}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setOrderSlide(slide)}>{t('actions.editOrder')}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setActive(slide, !slide.isActive)}>
                      {slide.isActive ? t('actions.deactivate') : t('actions.activate')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDeleteSlide(slide)}>{t('actions.delete')}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            />
          )}
        </Panel>
      </div>

      {orderSlide && <OrderDialog slide={orderSlide} onClose={() => setOrderSlide(null)} />}

      <AlertDialog open={deleteSlide !== null} onOpenChange={(open) => !open && setDeleteSlide(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmDelete.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmDelete.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">{t('confirmDelete.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
              disabled={remove.isPending}
            >
              {remove.isPending ? t('confirmDelete.deleting') : t('confirmDelete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
