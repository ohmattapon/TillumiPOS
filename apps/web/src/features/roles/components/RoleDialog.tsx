import { PERMISSION_GROUPS, PERMISSIONS } from '@pos/api/permissions'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCreateRole, useUpdateRole, type Role } from '../api'

export function RoleDialog({ role, onClose }: { role?: Role; onClose: () => void }) {
  const { t } = useTranslation('roles')
  const { t: tc } = useTranslation()
  const [name, setName] = useState(role?.name ?? '')
  const [permissions, setPermissions] = useState<string[]>(role?.systemKey === 'owner' ? [...PERMISSIONS] : role?.permissions ?? [])
  const create = useCreateRole(), update = useUpdateRole()
  const mutation = role ? update : create
  const owner = role?.systemKey === 'owner'
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (owner || !name.trim() || mutation.isPending) return
    const callbacks = { onSuccess: () => { toast.success(t('saved')); onClose() } }
    if (role) update.mutate({ id: role.id, changes: { ...(!role.systemKey && { name: name.trim() }), permissions } }, callbacks)
    else create.mutate({ name: name.trim(), permissions }, callbacks)
  }
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader><DialogTitle>{t(role ? 'editTitle' : 'newTitle')}</DialogTitle><DialogDescription>{t(owner ? 'ownerHint' : 'formHint')}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="role-name">{t('name')}</Label><Input id="role-name" className="h-11" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required disabled={Boolean(role?.systemKey)} autoFocus={!role?.systemKey} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          {PERMISSION_GROUPS.map((group) => <fieldset key={group.key} className="min-w-0 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">{t(`groups.${group.key}`)}</legend>
            {group.permissions.map((permission) => <label key={permission} className="flex min-h-11 cursor-pointer items-center gap-3 py-1 text-sm">
              <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={permissions.includes(permission)} disabled={owner || mutation.isPending}
                onChange={(event) => setPermissions(event.target.checked ? [...permissions, permission] : permissions.filter((value) => value !== permission))} />
              <span>{t(`permission.${permission}`)}</span>
            </label>)}
          </fieldset>)}
        </div>
        {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" className="h-11" onClick={onClose}>{tc(owner ? 'close' : 'cancel')}</Button>
          {!owner && <Button type="submit" className="h-11" disabled={!name.trim() || mutation.isPending}>{t(mutation.isPending ? 'saving' : 'save')}</Button>}</div>
      </form>
    </DialogContent>
  </Dialog>
}
