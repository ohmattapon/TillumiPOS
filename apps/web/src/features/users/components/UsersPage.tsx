import type { User } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Panel'
import { DataTable } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
      <PageHeader title={t('title')} description={users.isPending ? undefined : t('description', { items: tc('items', { count: all.length }) })}>
        <Button className="h-11 px-3" onClick={() => setDialog({})}>
          <Plus />
          {t('add')}
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Panel title={t('list.title')} description={t('list.description')}>
          {users.error && <p className="p-4 text-sm text-destructive">{users.error.message}</p>}
          <DataTable
            rows={all}
            rowKey={(user) => user.id}
            isPending={users.isPending}
            empty={t('list.empty')}
            muted={(user) => !user.isActive}
            columns={[
              {
                id: 'name',
                header: t('columns.name'),
                priority: 'primary',
                className: 'font-medium',
                cell: (user) => (
                  <>
                    {user.displayName}
                    {user.id === me?.id && <span className="ml-2 text-xs font-normal text-muted-foreground">({t('you')})</span>}
                  </>
                ),
              },
              { id: 'username', header: t('columns.username'), priority: 'secondary', cell: (user) => user.username },
              { id: 'role', header: t('columns.role'), priority: 'secondary', cell: (user) => t(`roles.${user.role}`) },
              { id: 'branch', header: t('columns.branch'), priority: 'wide-only', cell: (user) => branchName.get(user.branchId) ?? t('unknownBranch') },
              {
                id: 'status',
                header: t('columns.status'),
                priority: 'secondary',
                cell: (user) => (
                  <StatusBadge tone={user.isActive ? 'success' : 'neutral'}>
                    {user.isActive ? t('status.active') : t('status.inactive')}
                  </StatusBadge>
                ),
              },
            ]}
            actions={(user) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="size-11" aria-label={t('actions.more', { name: user.displayName })}>
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
            )}
          />
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
