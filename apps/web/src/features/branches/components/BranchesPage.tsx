import type { Branch } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Panel'
import { DataTable } from '@/components/DataTable'
import { PaginationBar } from '@/components/PaginationBar'
import { useListPagination } from '@/hooks/use-list-pagination'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { branchesQuery, useUpdateBranch } from '../api'
import { BranchFormDialog } from './BranchFormDialog'

type OpenDialog = { branch?: Branch } | null

/** Owner-only: add, edit and close branches. */
export function BranchesPage() {
  const { t } = useTranslation('branches')
  const { t: tc } = useTranslation()
  const branches = useQuery(branchesQuery)
  const update = useUpdateBranch()
  const [dialog, setDialog] = useState<OpenDialog>(null)

  const paging = useListPagination('branches')
  const all = branches.data ?? []

  const setOpen = (branch: Branch, isActive: boolean) =>
    update.mutate(
      { id: branch.id, changes: { isActive } },
      {
        onSuccess: () => toast.success(t(isActive ? 'toast.reopened' : 'toast.closed', { name: branch.name })),
        onError: (error) => toast.error(error.message),
      },
    )

  return (
    <>
      <PageHeader
        title={t('title')}
        description={branches.isPending ? undefined : t('description', { items: tc('items', { count: all.length }) })}
      >
        <Button className="h-11 px-3" onClick={() => setDialog({})}>
          <Plus />
          {t('add')}
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Panel title={t('list.title')} description={t('list.description')}>
          {branches.error && <p className="p-4 text-sm text-destructive">{branches.error.message}</p>}
          <DataTable
            rows={all.slice(paging.offset, paging.offset + paging.pageSize)}
            rowKey={(branch) => branch.id}
            isPending={branches.isPending}
            empty={t('list.empty')}
            muted={(branch) => !branch.isActive}
            columns={[
              { id: 'name', header: t('columns.name'), priority: 'primary', cell: (branch) => branch.name },
              { id: 'code', header: t('columns.code'), priority: 'secondary', className: 'font-medium tabular-nums', cell: (branch) => branch.code },
              { id: 'address', header: t('columns.address'), priority: 'wide-only', cell: (branch) => branch.address ?? '—' },
              { id: 'phone', header: t('columns.phone'), priority: 'wide-only', className: 'tabular-nums', cell: (branch) => branch.phone ?? '—' },
              {
                id: 'status',
                header: t('columns.status'),
                priority: 'secondary',
                cell: (branch) => (
                  <StatusBadge tone={branch.isActive ? 'success' : 'neutral'}>
                    {branch.isActive ? t('status.open') : t('status.closed')}
                  </StatusBadge>
                ),
              },
            ]}
            actions={(branch) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="size-11" aria-label={t('actions.more', { name: branch.name })}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDialog({ branch })}>{t('actions.edit')}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setOpen(branch, !branch.isActive)}>
                    {branch.isActive ? t('actions.close') : t('actions.reopen')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          />
          <PaginationBar {...paging} total={all.length} isLoading={branches.isFetching} onPageChange={paging.setPage} />
        </Panel>
      </div>

      {dialog && <BranchFormDialog branch={dialog.branch} onClose={() => setDialog(null)} />}
    </>
  )
}
