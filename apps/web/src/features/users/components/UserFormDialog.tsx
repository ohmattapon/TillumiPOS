import type { Branch, User } from '@pos/api/types'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateUser, useUpdateUser } from '../api'

const MIN_PASSWORD = 8
const roles: User['role'][] = ['cashier', 'owner']

interface Props {
  /** Omit to add a new user. */
  user?: User
  /** Open branches a user can be assigned to. */
  branches: Branch[]
  /** Preselected for a new user: the branch the owner is working in. */
  defaultBranchId: number | undefined
  onClose: () => void
}

export function UserFormDialog({ user, branches, defaultBranchId, onClose }: Props) {
  const { t } = useTranslation('users')
  const { t: tc } = useTranslation()
  const [form, setForm] = useState({
    username: user?.username ?? '',
    displayName: user?.displayName ?? '',
    role: user?.role ?? ('cashier' as User['role']),
    branchId: String(user?.branchId ?? defaultBranchId ?? branches[0]?.id ?? ''),
    password: '',
  })
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm({ ...form, [key]: value })

  const create = useCreateUser()
  const update = useUpdateUser()
  const mutation = user ? update : create

  // A new user needs a password; an existing one keeps theirs unless a new one is typed.
  const passwordOk = user ? form.password === '' || form.password.length >= MIN_PASSWORD : form.password.length >= MIN_PASSWORD
  const canSave = form.displayName.trim() !== '' && form.branchId !== '' && passwordOk && !mutation.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    const branchId = Number(form.branchId)
    const displayName = form.displayName.trim()

    if (user)
      update.mutate(
        { id: user.id, changes: { displayName, role: form.role, branchId, ...(form.password && { password: form.password }) } },
        {
          onSuccess: (saved) => {
            toast.success(t('toast.updated', { name: saved.displayName }))
            onClose()
          },
        },
      )
    else
      create.mutate(
        { username: form.username.trim(), password: form.password, displayName, role: form.role, branchId },
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? t('form.titleEdit') : t('form.titleNew')}</DialogTitle>
          <DialogDescription>{user ? t('form.descriptionEdit') : t('form.descriptionNew')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-username">{t('form.username')}</Label>
            <Input
              id="user-username"
              className="h-10"
              value={form.username}
              onChange={(event) => set('username', event.target.value)}
              disabled={user !== undefined}
              autoComplete="off"
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9_.\-]+"
              required
              autoFocus={user === undefined}
            />
            {!user && <p className="text-xs text-muted-foreground">{t('form.usernameHint')}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-display-name">{t('form.displayName')}</Label>
            <Input
              id="user-display-name"
              className="h-10"
              value={form.displayName}
              onChange={(event) => set('displayName', event.target.value)}
              maxLength={100}
              required
              autoFocus={user !== undefined}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="user-role">{t('form.role')}</Label>
              <Select value={form.role} onValueChange={(value) => set('role', value as User['role'])}>
                <SelectTrigger id="user-role" className="h-10! w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {t(`roles.${role}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-branch">{t('form.branch')}</Label>
              <Select value={form.branchId} onValueChange={(value) => set('branchId', value)}>
                <SelectTrigger id="user-branch" className="h-10! w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={String(branch.id)}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-password">{user ? t('form.newPassword') : t('form.password')}</Label>
            <Input
              id="user-password"
              type="password"
              className="h-10"
              value={form.password}
              onChange={(event) => set('password', event.target.value)}
              autoComplete="new-password"
              aria-invalid={!passwordOk && form.password !== ''}
              maxLength={72}
              required={user === undefined}
            />
            <p className="text-xs text-muted-foreground">{t('form.passwordHint')}</p>
          </div>

          {mutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" className="h-10" disabled={!canSave}>
              {mutation.isPending ? t('form.saving') : t('form.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
