import type { User } from '@pos/api/types'
import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { roleOptionsQuery } from '@/features/roles'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateUser, useUpdateUser } from '../api'
import { validateUserForm, type UserFormError, type UserFormField } from '../lib/validate-user-form'

interface Props {
  /** Omit to add a new user. */
  user?: User
  /** Prefills the role field when adding; ignored when editing. */
  initialRoleId?: number
  onClose: () => void
}

export function UserFormDialog({ user, initialRoleId, onClose }: Props) {
  const { t } = useTranslation('users')
  const { t: tc } = useTranslation()
  const roles = useQuery(roleOptionsQuery)
  const [form, setForm] = useState({
    username: user?.username ?? '',
    displayName: user?.displayName ?? '',
    roleId: user?.roleId ? String(user.roleId) : (initialRoleId ? String(initialRoleId) : ''),
    password: '',
  })
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm({ ...form, [key]: value })
    if (key === 'username' || key === 'displayName' || key === 'password')
      setErrors((previous) => ({ ...previous, [key]: undefined }))
  }

  const create = useCreateUser()
  const update = useUpdateUser()
  const mutation = user ? update : create

  const isNew = user === undefined
  const [errors, setErrors] = useState<Partial<Record<UserFormField, UserFormError>>>({})

  const fieldMessage = (field: UserFormField): string | undefined => {
    const error = errors[field]
    if (!error) return undefined
    if (field === 'username') return error === 'required' ? t('form.usernameRequired') : t('form.usernameInvalid')
    if (field === 'displayName') return t('form.displayNameRequired')
    return error === 'required' ? t('form.passwordRequired') : t('form.passwordTooShort')
  }

  const selectedRoleId = form.roleId || String(roles.data?.find((role) => role.systemKey === 'cashier')?.id ?? '')
  const canSave = selectedRoleId !== '' && !mutation.isPending && !roles.isPending && !roles.error

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateUserForm({ ...form, isNew })
    setErrors(found)
    if (Object.keys(found).length > 0 || !canSave) return
    const displayName = form.displayName.trim()

    if (user)
      update.mutate(
        { id: user.id, changes: { displayName, roleId: Number(selectedRoleId), ...(form.password && { password: form.password }) } },
        {
          onSuccess: (saved) => {
            toast.success(t('toast.updated', { name: saved.displayName }))
            onClose()
          },
        },
      )
    else
      create.mutate(
        { username: form.username.trim(), password: form.password, displayName, roleId: Number(selectedRoleId) },
        {
          onSuccess: (saved) => {
            toast.success(t('toast.created', { name: saved.displayName }))
            onClose()
          },
        },
      )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex flex-col overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? t('form.titleEdit') : t('form.titleNew')}</DialogTitle>
          <DialogDescription>{user ? t('form.descriptionEdit') : t('form.descriptionNew')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Only the fields scroll, so the confirm row stays at the bottom of the dialog. */}
          <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user-username">{t('form.username')}</Label>
              <Input
                id="user-username"
                className="h-11"
                value={form.username}
                onChange={(event) => set('username', event.target.value)}
                disabled={user !== undefined}
                autoComplete="off"
                maxLength={32}
                autoFocus={user === undefined}
                aria-invalid={errors.username !== undefined}
                aria-describedby={errors.username ? 'user-username-error' : undefined}
              />
              {!user && <p className="text-xs text-muted-foreground">{t('form.usernameHint')}</p>}
              {fieldMessage('username') && <FieldError id="user-username-error">{fieldMessage('username')}</FieldError>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-display-name">{t('form.displayName')}</Label>
              <Input
                id="user-display-name"
                className="h-11"
                value={form.displayName}
                onChange={(event) => set('displayName', event.target.value)}
                maxLength={100}
                autoFocus={user !== undefined}
                aria-invalid={errors.displayName !== undefined}
                aria-describedby={errors.displayName ? 'user-display-name-error' : undefined}
              />
              {fieldMessage('displayName') && <FieldError id="user-display-name-error">{fieldMessage('displayName')}</FieldError>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="user-role">{t('form.role')}</Label>
                {roles.isPending && !roles.error ? (
                  <div role="status" aria-busy="true">
                    <span className="sr-only">{tc('loading')}</span>
                    <Skeleton aria-hidden className="h-11 w-full" />
                  </div>
                ) : (
                  <Select value={selectedRoleId} onValueChange={(value) => set('roleId', value)} disabled={Boolean(roles.error)}>
                    <SelectTrigger id="user-role" className="h-11! w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(roles.data ?? []).map((role) => (
                        <SelectItem key={role.id} value={String(role.id)}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">{user ? t('form.newPassword') : t('form.password')}</Label>
              <Input
                id="user-password"
                type="password"
                className="h-11"
                value={form.password}
                onChange={(event) => set('password', event.target.value)}
                autoComplete="new-password"
                aria-invalid={errors.password !== undefined}
                aria-describedby={errors.password ? 'user-password-error' : undefined}
                maxLength={72}
              />
              <p className="text-xs text-muted-foreground">{t('form.passwordHint')}</p>
              {fieldMessage('password') && <FieldError id="user-password-error">{fieldMessage('password')}</FieldError>}
            </div>

            {roles.error && <p role="alert" className="text-sm text-destructive">{roles.error.message}</p>}
            {mutation.error && (
              <p role="alert" className="text-sm text-destructive">
                {mutation.error.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" className="h-11" disabled={!canSave}>
              {mutation.isPending ? t('form.saving') : t('form.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
