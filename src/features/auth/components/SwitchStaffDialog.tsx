import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { meQuery, switchUsersQuery, useCan, useSwitchUser } from '../api'
import { lockScreenMayClose, type LockScreenCloseReason } from '../lib/lock-screen'
import { canSubmitPin } from '../lib/pin-input'
import { PinPad } from './PinPad'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once the new person is in; the caller moves what belongs to the till (such as its register) to them. */
  onSwitched: (newUserId: number) => void
  /** Leaves the PIN path for the login page. The caller signs out, which clears the cart as it always did. */
  onUsePassword: () => void
}

/** Lock screen: choose a name, enter the PIN, and that person takes over the till with the cart kept. */
export function SwitchStaffDialog({ open, onOpenChange, onSwitched, onUsePassword }: Props) {
  const { t } = useTranslation('auth')
  const me = useQuery(meQuery).data
  const canManageUsers = useCan('users.manage')
  const users = useQuery({ ...switchUsersQuery, enabled: open })
  const [chosen, setChosen] = useState<{ id: number; displayName: string } | null>(null)
  const [pin, setPin] = useState('')
  const switchUser = useSwitchUser({
    onHandOver: (newUserId) => {
      close(false, 'hand-over')
      onSwitched(newUserId)
    },
  })

  function back() {
    setChosen(null)
    setPin('')
    switchUser.reset()
  }

  function close(next: boolean, reason: LockScreenCloseReason = 'user') {
    if (!next && !lockScreenMayClose(reason, switchUser.isPending)) return
    if (!next) back()
    onOpenChange(next)
  }

  const submit = () => {
    if (!chosen || !canSubmitPin(pin) || switchUser.isPending) return
    switchUser.mutate({ userId: chosen.id, pin }, { onError: () => setPin('') })
  }

  const items = users.data?.items ?? []

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-sm:top-0 max-sm:left-0 max-sm:h-svh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:content-start max-sm:rounded-none">
        <DialogHeader>
          <DialogTitle>{t('switch.title')}</DialogTitle>
          <DialogDescription>{chosen ? t('switch.enterPin', { name: chosen.displayName }) : t('switch.choose')}</DialogDescription>
        </DialogHeader>

        {chosen ? (
          <div className="flex flex-col gap-3">
            <PinPad pin={pin} onChange={setPin} onSubmit={submit} disabled={switchUser.isPending} />
            {switchUser.error && <p role="alert" className="text-center text-sm text-destructive">{switchUser.error.message}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-11" disabled={switchUser.isPending} onClick={back}>
                {t('switch.back')}
              </Button>
              <Button type="button" variant="outline" className="h-11" disabled={switchUser.isPending} onClick={() => close(false)}>
                {t('switch.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {users.isPending && (
              <div className="flex flex-col gap-2" role="status" aria-label={t('switch.loading')}>
                <Skeleton className="h-11" />
                <Skeleton className="h-11" />
              </div>
            )}
            {users.isError && (
              <div className="flex flex-col gap-2">
                <p role="alert" className="text-sm text-destructive">{users.error.message}</p>
                <Button type="button" variant="outline" className="h-11" onClick={() => users.refetch()}>
                  {t('switch.retry')}
                </Button>
              </div>
            )}
            {users.isSuccess && items.length === 0 && (
              // Only people who may open the users page are sent there; anyone can set their own PIN from the account menu.
              <p className="text-sm text-muted-foreground">{canManageUsers ? t('switch.empty') : t('switch.emptyOwnPin')}</p>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {items.map((user) => (
                <Button key={user.id} type="button" variant="outline" className="h-11 justify-between px-3" onClick={() => setChosen(user)}>
                  <span className="truncate">{user.displayName}</span>
                  {user.id === me?.id && <span className="text-xs text-muted-foreground">{t('switch.you')}</span>}
                </Button>
              ))}
            </div>
            <Button type="button" variant="outline" className="h-11" onClick={() => close(false)}>
              {t('switch.cancel')}
            </Button>
          </div>
        )}

        <Button type="button" variant="link" className="h-11" disabled={switchUser.isPending} onClick={onUsePassword}>
          {t('switch.usePassword')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
