import type { User } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { PaginationBar } from '@/components/PaginationBar'
import { useListPagination } from '@/hooks/use-list-pagination'
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
import { meQuery } from '@/features/auth'
import { branchesQuery, useActiveBranch } from '@/features/branches'
import { usersQuery, useUpdateUser } from '../api'
import { UserFormDialog } from './UserFormDialog'

type OpenDialog = { user?: User } | null

/** Owner-only: who can sign in, what they may do, and where they work. */
export function UsersPage() {
  const { t } = useTranslation('users')
  const { t: tc } = useTranslation()
  const users = useQuery(usersQuery)
  const branches = useQuery(branchesQuery)
  const me = useQuery(meQuery).data
  const { branch: workingBranch } = useActiveBranch()
  const update = useUpdateUser()
  const [dialog, setDialog] = useState<OpenDialog>(null)

  const paging = useListPagination('users')
  const all = users.data ?? []
  const branchName = new Map((branches.data ?? []).map((branch) => [branch.id, branch.name]))
  const openBranches = (branches.data ?? []).filter((branch) => branch.isActive)

  const setActive = (user: User, isActive: boolean) =>
    update.mutate(
      { id: user.id, changes: { isActive } },
      {
        onSuccess: () => toast.success(t(isActive ? 'toast.activated' : 'toast.deactivated', { name: user.displayName })),
        // The API refuses to remove the last active owner; show why.
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
          {users.error && <p className="p-4 text-sm text-destructive">{users.error.message}</p>}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={tableHead}>{t('columns.name')}</TableHead>
                <TableHead className={tableHead}>{t('columns.username')}</TableHead>
                <TableHead className={tableHead}>{t('columns.role')}</TableHead>
                <TableHead className={tableHead}>{t('columns.branch')}</TableHead>
                <TableHead className={tableHead}>{t('columns.status')}</TableHead>
                <TableHead className={`${tableHead} w-0`}>
                  <span className="sr-only">{t('columns.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {all.slice(paging.offset, paging.offset + paging.pageSize).map((user) => (
                <TableRow key={user.id} className={user.isActive ? '' : 'text-muted-foreground'}>
                  <TableCell className={`${tableCell} font-medium`}>
                    {user.displayName}
                    {user.id === me?.id && <span className="ml-2 text-xs font-normal text-muted-foreground">({t('you')})</span>}
                  </TableCell>
                  <TableCell className={tableCell}>{user.username}</TableCell>
                  <TableCell className={tableCell}>{t(`roles.${user.role}`)}</TableCell>
                  <TableCell className={tableCell}>{branchName.get(user.branchId) ?? t('unknownBranch')}</TableCell>
                  <TableCell className={tableCell}>
                    <StatusBadge tone={user.isActive ? 'success' : 'neutral'}>
                      {user.isActive ? t('status.active') : t('status.inactive')}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className={`${tableCell} text-right whitespace-nowrap`}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="size-9" aria-label={t('actions.more', { name: user.displayName })}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDialog({ user })}>{t('actions.edit')}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setActive(user, !user.isActive)}>
                          {user.isActive ? t('actions.deactivate') : t('actions.activate')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {!users.isPending && all.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    {t('list.empty')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <PaginationBar {...paging} total={all.length} isLoading={users.isFetching} onPageChange={paging.setPage} />
        </Panel>
      </div>

      {dialog && (
        <UserFormDialog
          user={dialog.user}
          branches={openBranches}
          defaultBranchId={workingBranch?.id}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}
