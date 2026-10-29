import type { User } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { SkeletonPanel } from '@/components/Skeletons'
import { PageHeader } from '@/components/PageHeader'
import { useAuthorization } from '@/features/auth'
import { RoleDialog, roleOptionsQuery } from '@/features/roles'
import { usersQuery, useUpdateUser } from '../api'
import { groupMembersByRole } from '../lib/group-members-by-role'
import { RoleCard } from './RoleCard'
import { UserFormDialog } from './UserFormDialog'
import { UserPinDialog } from './UserPinDialog'

/** Every role as a full-width card with its members, one under another so the tables line up. */
export function TeamPage() {
  const { t } = useTranslation('users')
  const { t: tr } = useTranslation('roles')
  const { t: tc } = useTranslation()
  const users = useQuery(usersQuery)
  // The full list, not a page: paging roles would strand members of other pages in "unassigned".
  const roles = useQuery(roleOptionsQuery)
  const update = useUpdateUser()
  const { can } = useAuthorization()
  const canManageMembers = can('users.manage')
  const canManageRoles = can('roles.manage')
  const [addingRole, setAddingRole] = useState(false)
  const [addRoleId, setAddRoleId] = useState<number | null>(null)
  const [editing, setEditing] = useState<User | null>(null)
  const [pinUser, setPinUser] = useState<User | null>(null)

  const all = users.data ?? []
  const groups = groupMembersByRole(all, roles.data ?? [])

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
      <PageHeader
        title={t('team.title')}
        description={users.isPending ? undefined : t('team.description', { items: tc('items', { count: all.length }) })}
      >
        {canManageRoles && (
          <Button className="h-11" onClick={() => setAddingRole(true)}>
            <Plus />
            {tr('add')}
          </Button>
        )}
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {users.error && <p className="p-4 text-sm text-destructive">{users.error.message}</p>}
        {roles.error && <p className="p-4 text-sm text-destructive">{roles.error.message}</p>}
        {roles.isPending && !roles.error && <SkeletonPanel rows={3} />}
        {groups.map(({ role, members }) => (
          <RoleCard
            key={role?.id ?? 'unassigned'}
            role={role}
            members={members}
            isPending={users.isPending}
            onAdd={role ? () => setAddRoleId(role.id) : undefined}
            onEdit={setEditing}
            onSetPin={setPinUser}
            onToggleActive={(user) => setActive(user, !user.isActive)}
            canManageMembers={canManageMembers}
            canManageRoles={canManageRoles}
          />
        ))}
      </div>

      {addingRole && <RoleDialog onClose={() => setAddingRole(false)} />}
      {addRoleId !== null && <UserFormDialog initialRoleId={addRoleId} onClose={() => setAddRoleId(null)} />}
      {editing && <UserFormDialog user={editing} onClose={() => setEditing(null)} />}
      {pinUser && <UserPinDialog user={pinUser} onClose={() => setPinUser(null)} />}
    </>
  )
}
