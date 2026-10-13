import type { Branch } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Panel, tableCell, tableHead } from '@/components/Panel'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
        description={t('description', { items: tc('items', { count: all.length }) })}
      >
        <Button className="h-9 px-3" onClick={() => setDialog({})}>
          <Plus />
          {t('add')}
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Panel title={t('list.title')} description={t('list.description')}>
          {branches.error && <p className="p-4 text-sm text-destructive">{branches.error.message}</p>}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={tableHead}>{t('columns.code')}</TableHead>
                <TableHead className={tableHead}>{t('columns.name')}</TableHead>
                <TableHead className={tableHead}>{t('columns.address')}</TableHead>
                <TableHead className={tableHead}>{t('columns.phone')}</TableHead>
                <TableHead className={tableHead}>{t('columns.status')}</TableHead>
                <TableHead className={`${tableHead} w-0`}>
                  <span className="sr-only">{t('columns.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {all.map((branch) => (
                <TableRow key={branch.id} className={branch.isActive ? '' : 'text-muted-foreground'}>
                  <TableCell className={`${tableCell} font-medium tabular-nums`}>{branch.code}</TableCell>
                  <TableCell className={tableCell}>{branch.name}</TableCell>
                  <TableCell className={tableCell}>{branch.address ?? '—'}</TableCell>
                  <TableCell className={`${tableCell} tabular-nums`}>{branch.phone ?? '—'}</TableCell>
                  <TableCell className={tableCell}>
                    <StatusBadge tone={branch.isActive ? 'success' : 'neutral'}>
                      {branch.isActive ? t('status.open') : t('status.closed')}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className={`${tableCell} text-right whitespace-nowrap`}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="size-9" aria-label={t('actions.more', { name: branch.name })}>
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
                  </TableCell>
                </TableRow>
              ))}
              {!branches.isPending && all.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    {t('list.empty')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Panel>
      </div>

      {dialog && <BranchFormDialog branch={dialog.branch} onClose={() => setDialog(null)} />}
    </>
  )
}
