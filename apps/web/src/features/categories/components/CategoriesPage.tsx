import type { Category } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { DataTable } from '@/components/DataTable'
import { Panel } from '@/components/Panel'
import { PaginationBar } from '@/components/PaginationBar'
import { useListPagination } from '@/hooks/use-list-pagination'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { categoriesQuery, useCreateCategory, useUpdateCategory } from '../api'
import { CategoryDot } from './CategoryDot'

type OpenDialog = { category?: Category } | null

function CategoryFormDialog({ category, onClose }: { category?: Category; onClose: () => void }) {
  const { t } = useTranslation('categories')
  const { t: tc } = useTranslation()
  const [name, setName] = useState(category?.name ?? '')
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0))
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const mutation = category ? update : create

  const order = /^-?\d+$/.test(sortOrder.trim()) ? Number(sortOrder) : null
  const canSave = name.trim() !== '' && order !== null && !mutation.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSave || order === null) return
    const done = (saved: Category) => {
      toast.success(t(category ? 'toast.updated' : 'toast.created', { name: saved.name }))
      onClose()
    }
    if (category) update.mutate({ id: category.id, changes: { name: name.trim(), sortOrder: order } }, { onSuccess: done })
    else create.mutate({ name: name.trim(), sortOrder: order }, { onSuccess: done })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{category ? t('form.titleEdit') : t('form.titleNew')}</DialogTitle>
          <DialogDescription>{t('form.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category-name">{t('form.name')}</Label>
            <Input
              id="category-name"
              className="h-10"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-order">{t('form.sortOrder')}</Label>
            <Input
              id="category-order"
              className="h-10 w-32 text-right tabular-nums"
              inputMode="numeric"
              value={sortOrder}
              aria-invalid={order === null}
              onChange={(event) => setSortOrder(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('form.sortOrderHint')}</p>
          </div>

          {mutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" className="h-10" disabled={!canSave}>
              {mutation.isPending ? t('form.saving') : t('form.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Owner-only: the groups products are sorted into on the sell screen. */
export function CategoriesPage() {
  const { t } = useTranslation('categories')
  const { t: tc } = useTranslation()
  const categories = useQuery(categoriesQuery)
  const update = useUpdateCategory()
  const [dialog, setDialog] = useState<OpenDialog>(null)

  const paging = useListPagination('categories')
  const all = categories.data ?? []

  const setActive = (category: Category, isActive: boolean) =>
    update.mutate(
      { id: category.id, changes: { isActive } },
      {
        onSuccess: () => toast.success(t(isActive ? 'toast.activated' : 'toast.deactivated', { name: category.name })),
        onError: (error) => toast.error(error.message),
      },
    )

  return (
    <>
      <PageHeader title={t('title')} description={categories.isPending ? undefined : t('description', { items: tc('items', { count: all.length }) })}>
        <Button className="h-11 px-3" onClick={() => setDialog({})}>
          <Plus />
          {t('add')}
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Panel title={t('list.title')} description={t('list.description')}>
          {categories.error && <p className="p-4 text-sm text-destructive">{categories.error.message}</p>}
          <DataTable
            rows={all.slice(paging.offset, paging.offset + paging.pageSize)}
            rowKey={(category) => category.id}
            isPending={categories.isPending}
            empty={t('list.empty')}
            muted={(category) => !category.isActive}
            columns={[
              { id: 'name', header: t('columns.name'), priority: 'primary', className: 'font-medium', cell: (category) => (
                <span className="inline-flex items-center gap-2">
                  <CategoryDot categoryId={category.id} />
                  {category.name}
                </span>
              ) },
              { id: 'sortOrder', header: t('columns.sortOrder'), priority: 'wide-only', align: 'right', cell: (category) => category.sortOrder },
              {
                id: 'status',
                header: t('columns.status'),
                priority: 'secondary',
                cell: (category) => (
                  <StatusBadge tone={category.isActive ? 'success' : 'neutral'}>
                    {category.isActive ? t('status.active') : t('status.inactive')}
                  </StatusBadge>
                ),
              },
            ]}
            actions={(category) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="size-11" aria-label={t('actions.more', { name: category.name })}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDialog({ category })}>{t('actions.edit')}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setActive(category, !category.isActive)}>
                    {category.isActive ? t('actions.deactivate') : t('actions.activate')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          />
          <PaginationBar {...paging} total={all.length} isLoading={categories.isFetching} onPageChange={paging.setPage} />
        </Panel>
      </div>

      {dialog && <CategoryFormDialog category={dialog.category} onClose={() => setDialog(null)} />}
    </>
  )
}
