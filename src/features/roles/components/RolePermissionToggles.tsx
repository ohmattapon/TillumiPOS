import { PERMISSIONS } from '@pos/api/permissions'
import { useTranslation } from 'react-i18next'
import { useUpdateRole, type Role } from '../api'
import { groupPermissions } from '../lib/permission-groups'

/** Inline permission checkboxes for one role card. Takes a Role and nothing else; data fetching stays in the card. */
export function RolePermissionToggles({ role }: { role: Role }) {
  const { t } = useTranslation('roles')
  const update = useUpdateRole()
  const owner = role.systemKey === 'owner'
  const current = owner ? [...PERMISSIONS] : role.permissions
  const toggle = (permission: string, checked: boolean) => {
    if (owner || update.isPending) return
    const permissions = checked ? [...role.permissions, permission] : role.permissions.filter((value) => value !== permission)
    update.mutate({ id: role.id, changes: { permissions } })
  }
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium">{t('permissions')}</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        {groupPermissions(PERMISSIONS).map((group) => (
          <fieldset key={group.key} className="min-w-0 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">{t(`groups.${group.key}`)}</legend>
            {group.permissions.map((permission) => (
              <label key={permission} className="flex min-h-11 cursor-pointer items-center gap-3 py-1 text-sm">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-primary"
                  checked={current.includes(permission)}
                  disabled={owner || update.isPending}
                  onChange={(event) => toggle(permission, event.target.checked)}
                />
                <span>{t(`permission.${permission}`)}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      {update.error && <p role="alert" className="text-sm text-destructive">{update.error.message}</p>}
    </div>
  )
}
