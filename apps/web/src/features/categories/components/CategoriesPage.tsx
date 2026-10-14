import type { Category } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Panel, tableCell, tableHead } from '@/components/Panel'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { categoriesQuery, useCreateCategory, useUpdateCategory } from '../api'

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
      <PageHeader title={t('title')} description={t('description', { items: tc('items', { count: all.length }) })}>
        <Button className="h-9 px-3" onClick={() => setDialog({})}>
          <Plus />
          {t('add')}
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Panel title={t('list.title')} description={t('list.description')}>
          {categories.error && <p className="p-4 text-sm text-destructive">{categories.error.message}</p>}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={tableHead}>{t('columns.name')}</TableHead>
                <TableHead className={`${tableHead} text-right`}>{t('columns.sortOrder')}</TableHead>
                <TableHead className={tableHead}>{t('columns.status')}</TableHead>
                <TableHead className={`${tableHead} w-0`}>
                  <span className="sr-only">{t('columns.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {all.map((category) => (
                <TableRow key={category.id} className={category.isActive ? '' : 'text-muted-foreground'}>
                  <TableCell className={`${tableCell} font-medium`}>{category.name}</TableCell>
                  <TableCell className={`${tableCell} text-right tabular-nums`}>{category.sortOrder}</TableCell>
                  <TableCell className={tableCell}>
                    <StatusBadge tone={category.isActive ? 'success' : 'neutral'}>
                      {category.isActive ? t('status.active') : t('status.inactive')}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className={`${tableCell} text-right whitespace-nowrap`}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="size-9" aria-label={t('actions.more', { name: category.name })}>
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
                  </TableCell>
                </TableRow>
              ))}
              {!categories.isPending && all.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    {t('list.empty')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Panel>
      </div>

      {dialog && <CategoryFormDialog category={dialog.category} onClose={() => setDialog(null)} />}
    </>
  )
}
