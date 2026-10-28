import { PERMISSIONS } from '@pos/api/permissions'
import { ChevronDown, ShieldCheck } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useUpdateRole, type Role } from '../api'
import { countGranted, groupPermissions } from '../lib/permission-groups'

/**
 * The permission section at the foot of a role card. Collapsed to an "x of y" summary so a page of
 * roles stays scannable; the owner role has every permission by rule, so it shows that line instead.
 */
export function RolePermissionToggles({ role }: { role: Role }) {
  const { t } = useTranslation('roles')
  const update = useUpdateRole()
  const [open, setOpen] = useState(false)
  const panelId = useId()

  if (role.systemKey === 'owner') {
    return (
      <div className="flex min-h-11 items-center gap-2 border-t px-4 py-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0 text-success" />
        {t('ownerHint')}
      </div>
    )
  }

  const { granted, total } = countGranted(role.permissions)
  const toggle = (permission: string, checked: boolean) => {
    if (update.isPending) return
    const permissions = checked ? [...role.permissions, permission] : role.permissions.filter((value) => value !== permission)
    update.mutate({ id: role.id, changes: { permissions } })
  }

  return (
    <div className="border-t">
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-muted/50"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="font-medium">{t('permissions')}</span>
        <span className="text-muted-foreground">{t('grantedSummary', { granted, total })}</span>
        <ChevronDown className={cn('ml-auto size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div id={panelId} className="grid gap-x-6 gap-y-4 border-t bg-muted/30 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {groupPermissions(PERMISSIONS).map((group) => (
            <fieldset key={group.key} className="min-w-0">
              <legend className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">{t(`groups.${group.key}`)}</legend>
              {group.permissions.map((permission) => (
                <label key={permission} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-primary"
                    checked={role.permissions.includes(permission)}
                    disabled={update.isPending}
                    onChange={(event) => toggle(permission, event.target.checked)}
                  />
                  <span>{t(`permission.${permission}`)}</span>
                </label>
              ))}
            </fieldset>
          ))}
          {update.error && <p role="alert" className="text-sm text-destructive sm:col-span-2 lg:col-span-3">{update.error.message}</p>}
        </div>
      )}
    </div>
  )
}
