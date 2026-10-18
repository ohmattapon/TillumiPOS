import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSetOwnPin } from '../api'
import { canSubmitPin, PIN_MAX_LENGTH } from '../lib/pin-input'

interface Props {
  hasPin: boolean
  onClose: () => void
}

/** The signed-in user sets or removes their own PIN. The current password proves it is them. */
export function OwnPinDialog({ hasPin, onClose }: Props) {
  const { t } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const mutation = useSetOwnPin()

  const canSave = password !== '' && canSubmitPin(pin) && !mutation.isPending
  const send = (next: string | null) =>
    mutation.mutate(
      { currentPassword: password, pin: next },
      {
        onSuccess: () => {
          toast.success(t(next === null ? 'pin.removed' : 'pin.saved'))
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
          <DialogTitle>{t('pin.setOwn')}</DialogTitle>
          <DialogDescription>{t('pin.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="own-pin-password">{t('pin.currentPassword')}</Label>
            <Input
              id="own-pin-password"
              type="password"
              className="h-11"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              maxLength={72}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="own-pin-new">{t('pin.newPin')}</Label>
            <Input
              id="own-pin-new"
              type="password"
              inputMode="numeric"
              className="h-11"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, PIN_MAX_LENGTH))}
              autoComplete="off"
              aria-describedby="own-pin-hint"
            />
            <p id="own-pin-hint" className="text-xs text-muted-foreground">{t('pin.hint')}</p>
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
            {hasPin && (
              <Button type="button" variant="outline" className="h-11" disabled={password === '' || mutation.isPending} onClick={() => send(null)}>
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
