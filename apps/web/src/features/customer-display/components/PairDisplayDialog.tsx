import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { displayPairingQuery, usePairDisplay, useUnpairDisplay } from '../api'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The register whose sales the screen follows; without one the server uses the user's default. */
  registerId: number | undefined
}

/** The cashier types the code a screen shows; from then on that screen follows this register. */
export function PairDisplayDialog({ open, onOpenChange, registerId }: Props) {
  const { t } = useTranslation('customerDisplay')
  const { t: tc } = useTranslation()
  const pairing = useQuery({ ...displayPairingQuery(registerId), enabled: open })
  const pair = usePairDisplay(registerId)
  const unpair = useUnpairDisplay(registerId)
  const [code, setCode] = useState('')
  const [confirmingUnpair, setConfirmingUnpair] = useState(false)
  const displays = pairing.data?.displays ?? 0
  const complete = /^\d{6}$/.test(code)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!complete) return
    pair.mutate(code, { onSuccess: () => setCode('') })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('pair.title')}</DialogTitle>
          <DialogDescription>{t('pair.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input
            className="h-11 text-center text-lg tabular-nums tracking-[0.3em]"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            placeholder="000000"
            aria-label={t('pair.codeLabel')}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          {pair.error && <p role="alert" className="text-sm text-destructive">{pair.error.message}</p>}
          <Button type="submit" className="h-11" disabled={!complete || pair.isPending}>
            {t('pair.submit')}
          </Button>
        </form>

        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <p className="text-sm text-muted-foreground">{t('pair.connected', { count: displays })}</p>
          <Button variant="outline" className="h-11" disabled={displays === 0 || unpair.isPending} onClick={() => setConfirmingUnpair(true)}>
            {t('pair.disconnect')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    {confirmingUnpair && (
      <ConfirmDialog
        open
        onOpenChange={(open) => !open && setConfirmingUnpair(false)}
        title={t('pair.disconnect')}
        description={t('pair.unpairDescription')}
        confirmLabel={t('pair.disconnect')}
        cancelLabel={tc('cancel')}
        destructive
        pending={unpair.isPending}
        onConfirm={() => {
          unpair.mutate()
          setConfirmingUnpair(false)
        }}
      />
    )}
    </>
  )
}
