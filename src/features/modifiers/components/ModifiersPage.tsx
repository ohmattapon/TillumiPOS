import type { ModifierGroup, ModifierOption } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { PaginationBar } from '@/components/PaginationBar'
import { PaginatedItems } from '@/components/PaginatedItems'
import { useListPagination } from '@/hooks/use-list-pagination'
import { Panel } from '@/components/Panel'
import { SkeletonPanel } from '@/components/Skeletons'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useFormat } from '@/features/settings'
import {
  modifierGroupsQuery,
  useCreateModifierGroup,
  useCreateModifierOption,
  useUpdateModifierGroup,
  useUpdateModifierOption,
} from '../api'

type GroupDialog = { group?: ModifierGroup } | null
type OptionDialog = { group: ModifierGroup; option?: ModifierOption } | null

const isWhole = (value: string) => /^-?\d+$/.test(value.trim())

function GroupFormDialog({ group, onClose }: { group?: ModifierGroup; onClose: () => void }) {
  const { t } = useTranslation('modifiers')
  const { t: tc } = useTranslation()
  const [name, setName] = useState(group?.name ?? '')
  const [required, setRequired] = useState(group?.required ?? false)
  const [maxSelections, setMaxSelections] = useState(String(group?.maxSelections ?? 1))
  const [sortOrder, setSortOrder] = useState(String(group?.sortOrder ?? 0))
  const create = useCreateModifierGroup()
  const update = useUpdateModifierGroup()
  const mutation = group ? update : create

  const max = isWhole(maxSelections) ? Number(maxSelections) : null
  const order = isWhole(sortOrder) ? Number(sortOrder) : null
  const canSave = name.trim() !== '' && max !== null && max >= 1 && max <= 20 && order !== null && !mutation.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSave || max === null || order === null) return
    const input = { name: name.trim(), required, maxSelections: max, sortOrder: order }
    const done = (saved: { name: string }) => {
      toast.success(t(group ? 'toast.groupUpdated' : 'toast.groupCreated', { name: saved.name }))
      onClose()
    }
    if (group) update.mutate({ id: group.id, changes: input }, { onSuccess: done })
    else create.mutate(input, { onSuccess: done })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{group ? t('groupForm.titleEdit') : t('groupForm.titleNew')}</DialogTitle>
          <DialogDescription>{t('groupForm.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">{t('groupForm.name')}</Label>
            <Input
              id="group-name"
              className="h-10"
              value={name}
              maxLength={100}
              required
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <span>
              <span className="block text-sm font-medium">{t('groupForm.required')}</span>
              <span className="block text-xs text-muted-foreground">{t('groupForm.requiredHint')}</span>
            </span>
            <Switch checked={required} onCheckedChange={setRequired} />
          </label>
          <div className="space-y-2">
            <Label htmlFor="group-max">{t('groupForm.maxSelections')}</Label>
            <Input
              id="group-max"
              className="h-10 w-32 text-right tabular-nums"
              inputMode="numeric"
              value={maxSelections}
              aria-invalid={max === null || max < 1 || max > 20}
              onChange={(event) => setMaxSelections(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('groupForm.maxSelectionsHint')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-order">{t('groupForm.sortOrder')}</Label>
            <Input
              id="group-order"
              className="h-10 w-32 text-right tabular-nums"
              inputMode="numeric"
              value={sortOrder}
              aria-invalid={order === null}
              onChange={(event) => setSortOrder(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('groupForm.sortOrderHint')}</p>
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
              {mutation.isPending ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function OptionFormDialog({
  group,
  option,
  onClose,
}: {
  group: ModifierGroup
  option?: ModifierOption
  onClose: () => void
}) {
  const { t } = useTranslation('modifiers')
  const { t: tc } = useTranslation()
  const { money, currency } = useFormat()
  const [name, setName] = useState(option?.name ?? '')
  const [price, setPrice] = useState(option ? money.toInput(option.priceSatang) : '')
  const [cost, setCost] = useState(option ? money.toInput(option.costSatang) : '')
  const [sortOrder, setSortOrder] = useState(String(option?.sortOrder ?? 0))
  const create = useCreateModifierOption()
  const update = useUpdateModifierOption()
  const mutation = option ? update : create

  const priceSatang = price.trim() === '' ? 0 : money.parse(price)
  const costSatang = cost.trim() === '' ? 0 : money.parse(cost)
  const order = isWhole(sortOrder) ? Number(sortOrder) : null
  const canSave =
    name.trim() !== '' && priceSatang !== null && costSatang !== null && order !== null && !mutation.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSave || priceSatang === null || costSatang === null || order === null) return
    const input = { name: name.trim(), priceSatang, costSatang, sortOrder: order, isDefault: option?.isDefault ?? false }
    const done = (saved: { name: string }) => {
      toast.success(t(option ? 'toast.optionUpdated' : 'toast.optionCreated', { name: saved.name }))
      onClose()
    }
    if (option) update.mutate({ id: option.id, changes: input }, { onSuccess: done })
    else create.mutate({ groupId: group.id, input }, { onSuccess: done })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{option ? t('optionForm.titleEdit') : t('optionForm.titleNew')}</DialogTitle>
          <DialogDescription>{t('optionForm.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="option-name">{t('optionForm.name')}</Label>
            <Input
              id="option-name"
              className="h-10"
              value={name}
              maxLength={100}
              required
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="option-price">{t('optionForm.price', { currency })}</Label>
              <Input
                id="option-price"
                className="h-10 text-right tabular-nums"
                inputMode="decimal"
                value={price}
                placeholder={money.plain(0)}
                aria-invalid={priceSatang === null}
                onChange={(event) => setPrice(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="option-cost">{t('optionForm.cost', { currency })}</Label>
              <Input
                id="option-cost"
                className="h-10 text-right tabular-nums"
                inputMode="decimal"
                value={cost}
                placeholder={money.plain(0)}
                aria-invalid={costSatang === null}
                onChange={(event) => setCost(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="option-order">{t('optionForm.sortOrder')}</Label>
            <Input
              id="option-order"
              className="h-10 w-32 text-right tabular-nums"
              inputMode="numeric"
              value={sortOrder}
              aria-invalid={order === null}
              onChange={(event) => setSortOrder(event.target.value)}
            />
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
              {mutation.isPending ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Owner-only: the groups of options offered when a product is sold. */
export function ModifiersPage() {
  const { t } = useTranslation('modifiers')
  const { t: tc } = useTranslation()
  const { money } = useFormat()
  const groups = useQuery(modifierGroupsQuery)
  const updateGroup = useUpdateModifierGroup()
  const updateOption = useUpdateModifierOption()
  const [groupDialog, setGroupDialog] = useState<GroupDialog>(null)
  const [optionDialog, setOptionDialog] = useState<OptionDialog>(null)

  const paging = useListPagination('modifier-groups', 5)
  const all = groups.data ?? []
  const onError = (error: Error) => toast.error(error.message)

  return (
    <>
      <PageHeader title={t('title')} description={groups.isPending ? undefined : t('description', { items: tc('items', { count: all.length }) })}>
        <Button className="h-11 px-3" onClick={() => setGroupDialog({})}>
          <Plus />
          {t('addGroup')}
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {groups.error && <p className="text-sm text-destructive">{groups.error.message}</p>}
        {groups.isPending && Array.from({ length: 2 }, (_, index) => <SkeletonPanel key={index} rows={3} />)}
        {!groups.isPending && all.length === 0 && (
          <p className="py-12 text-center text-muted-foreground">{t('empty')}</p>
        )}

        {all.slice(paging.offset, paging.offset + paging.pageSize).map((group) => (
          <Panel
            key={group.id}
            title={group.name}
            description={[
              group.required ? t('group.summaryRequired') : t('group.summaryOptional'),
              group.maxSelections === 1 ? t('group.one') : t('group.many', { count: group.maxSelections }),
              t('group.products', { count: group.productIds.length }),
            ].join(', ')}
          >
            <div className="flex items-center gap-2 border-b px-4 py-2">
              {!group.isActive && <StatusBadge tone="neutral">{t('group.inactive')}</StatusBadge>}
              <Button variant="outline" className="ml-auto h-9" onClick={() => setOptionDialog({ group })}>
                <Plus />
                {t('addOption')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="size-9" aria-label={t('group.actions', { name: group.name })}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setGroupDialog({ group })}>{t('group.edit')}</DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      updateGroup.mutate({ id: group.id, changes: { isActive: !group.isActive } }, { onError })
                    }
                  >
                    {group.isActive ? t('group.deactivate') : t('group.activate')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <PaginatedItems items={group.options} scope={`options:${group.id}`}>
              {(options) => (
                <ul className="divide-y">
                  {group.options.length === 0 && (
                      <li className="px-4 py-6 text-center text-sm text-muted-foreground">{t('noOptions')}</li>
                    )}
                  {options.map((option) => (
                    <li
                      key={option.id}
                      className={`flex items-center gap-3 px-4 py-2 ${option.isActive ? '' : 'text-muted-foreground'}`}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{option.name}</span>
                      {!option.isActive && <StatusBadge tone="neutral">{t('option.inactive')}</StatusBadge>}
                      <label className="flex min-h-11 items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          className="size-5 accent-primary"
                          checked={option.isDefault}
                          aria-label={t('option.setDefault', { name: option.name })}
                          onChange={() =>
                            updateOption.mutate(
                              { id: option.id, changes: { isDefault: !option.isDefault } },
                              { onError },
                            )
                          }
                        />
                        <span className="hidden sm:inline">{t('option.default')}</span>
                      </label>
                      <span className="text-sm tabular-nums">
                        {option.priceSatang > 0 ? `+${money.plain(option.priceSatang)}` : t('option.free')}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="size-9" aria-label={t('option.actions', { name: option.name })}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setOptionDialog({ group, option })}>
                            {t('option.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              updateOption.mutate({ id: option.id, changes: { isActive: !option.isActive } }, { onError })
                            }
                          >
                            {option.isActive ? t('option.deactivate') : t('option.activate')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  ))}
                  {group.options.length > 0 && (
                    <li className="px-4 py-2 text-xs text-muted-foreground">{t('group.defaultHint')}</li>
                  )}
                </ul>
              )}
            </PaginatedItems>
          </Panel>
        ))}
        <PaginationBar {...paging} total={all.length} isLoading={groups.isFetching} onPageChange={paging.setPage} />
      </div>

      {groupDialog && <GroupFormDialog group={groupDialog.group} onClose={() => setGroupDialog(null)} />}
      {optionDialog && (
        <OptionFormDialog group={optionDialog.group} option={optionDialog.option} onClose={() => setOptionDialog(null)} />
      )}
    </>
  )
}
