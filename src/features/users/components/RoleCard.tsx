import type { User } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataTable } from '@/components/DataTable'
import { PaginationBar } from '@/components/PaginationBar'
import { Panel } from '@/components/Panel'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useListPagination } from '@/hooks/use-list-pagination'
import { meQuery } from '@/features/auth'
import { RoleCardMenu, RolePermissionToggles, type Role } from '@/features/roles'
import { canSetPinFor } from '../lib/can-set-pin-for'

interface RoleCardProps {
  /** Null renders the tail group of members whose roleId matches no known role. */
  role: Role | null
  members: User[]
  isPending: boolean
  /** Omit for the unassigned group: a new user always belongs to a real role. */
  onAdd?: () => void
  onEdit: (user: User) => void
  onSetPin: (user: User) => void
  onToggleActive: (user: User) => void
  /** Section gates so users.manage-only and roles.manage-only audiences keep what they had. */
  canManageMembers: boolean
  canManageRoles: boolean
}

/** One role and its members. Lane C mounts the permission toggles + role menu in the Panel action slot. */
export function RoleCard({ role, members, isPending, onAdd, onEdit, onSetPin, onToggleActive, canManageMembers, canManageRoles }: RoleCardProps) {
  const { t } = useTranslation('users')
  const { t: tr } = useTranslation('roles')
  const me = useQuery(meQuery).data
  const paging = useListPagination(`team-${role?.id ?? 'unassigned'}`)

  const system = role?.systemKey ? ` · ${tr('system')}` : ''

  return (
    <Panel
      title={role?.name ?? t('team.unassigned')}
      description={`${t('team.members', { count: members.length })}${system}`}
      action={(canManageMembers && onAdd) || (canManageRoles && role) ? (
        <div className="flex items-center gap-1">
          {canManageMembers && onAdd && (
            <Button className="h-11 px-3" onClick={onAdd}>
              <Plus />
              {t('team.addUser')}
            </Button>
          )}
          {canManageRoles && role && <RoleCardMenu role={role} />}
        </div>
      ) : undefined}
    >
      <DataTable
        rows={members.slice(paging.offset, paging.offset + paging.pageSize)}
        rowKey={(user) => user.id}
        isPending={isPending}
        empty={t('team.empty')}
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
          { id: 'role', header: t('columns.role'), priority: 'secondary', cell: (user) => role?.name ?? t(`roles.${user.role}`) },
          {
            id: 'pin',
            header: t('columns.pin'),
            priority: 'secondary',
            cell: (user) => <StatusBadge tone={user.hasPin ? 'success' : 'neutral'}>{user.hasPin ? t('pin.set') : t('pin.none')}</StatusBadge>,
          },
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
        actions={(user) => canManageMembers && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="size-11" aria-label={t('actions.more', { name: user.displayName })}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(user)}>{t('actions.edit')}</DropdownMenuItem>
              {me && canSetPinFor(user, me) && <DropdownMenuItem onSelect={() => onSetPin(user)}>{t('actions.setPin')}</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => onToggleActive(user)}>
                {user.isActive ? t('actions.deactivate') : t('actions.activate')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />
      <PaginationBar {...paging} total={members.length} isLoading={isPending} onPageChange={paging.setPage} />
      {role && canManageRoles && <RolePermissionToggles role={role} />}
    </Panel>
  )
}
