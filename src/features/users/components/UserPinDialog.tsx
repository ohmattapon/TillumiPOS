import type { User } from '@pos/api/types'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { canSubmitPin, PIN_MAX_LENGTH } from '@/features/auth'
import { useSetUserPin } from '../api'

interface Props {
  user: User
  onClose: () => void
}

/** Sets or removes another user's PIN. Removing one is how a forgotten PIN is reset. */
export function UserPinDialog({ user, onClose }: Props) {
  const { t } = useTranslation('users')
  const { t: tc } = useTranslation()
  const [pin, setPin] = useState('')
  const mutation = useSetUserPin()

  const canSave = canSubmitPin(pin) && !mutation.isPending
  const send = (next: string | null) =>
    mutation.mutate(
      { id: user.id, pin: next },
      {
        onSuccess: () => {
          toast.success(t(next === null ? 'pin.removed' : 'pin.saved', { name: user.displayName }))
          onClose()
        },
      },
    )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (canSave) send(pin)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pin.title', { name: user.displayName })}</DialogTitle>
          <DialogDescription>{t('pin.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="user-pin-new">{t('pin.newPin')}</Label>
            <Input
              id="user-pin-new"
              type="password"
              inputMode="numeric"
              className="h-11"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, PIN_MAX_LENGTH))}
              autoComplete="off"
              aria-describedby="user-pin-hint"
              autoFocus
            />
            <p id="user-pin-hint" className="text-xs text-muted-foreground">{t('pin.hint')}</p>
          </div>

          {mutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>
              {tc('cancel')}
            </Button>
            {user.hasPin && (
              <Button type="button" variant="outline" className="h-11" disabled={mutation.isPending} onClick={() => send(null)}>
                {t('pin.remove')}
              </Button>
            )}
            <Button type="submit" className="h-11" disabled={!canSave}>
              {mutation.isPending ? t('pin.saving') : t('pin.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
