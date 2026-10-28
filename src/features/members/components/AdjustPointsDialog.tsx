import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAdjustMemberPoints } from '../api'

/** A signed number of points a user with the permission adds to or takes from a member. */
export function AdjustPointsDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation('members')
  const adjust = useAdjustMemberPoints()
  const [points, setPoints] = useState('')
  const [reason, setReason] = useState('')
  const parsed = Number(points)
  const isValid =
    points.trim() !== '' &&
    Number.isInteger(parsed) &&
    parsed !== 0 &&
    Math.abs(parsed) <= 1_000_000 &&
    reason.trim() !== ''

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!isValid) return
    adjust.mutate(
      { id, points: parsed, reason: reason.trim() },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !adjust.isPending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('adjustPoints')}</DialogTitle>
          <DialogDescription>{t('adjustPointsHint')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="adjust-points">{t('pointsDelta')}</FieldLabel>
              <Input
                id="adjust-points"
                className="h-11 tabular-nums"
                inputMode="numeric"
                autoComplete="off"
                placeholder={t('pointsDeltaHint')}
                value={points}
                onChange={(event) => setPoints(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="adjust-reason">{t('reason')}</FieldLabel>
              <Input
                id="adjust-reason"
                className="h-11"
                autoComplete="off"
                maxLength={200}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </FieldGroup>
          {adjust.error && (
            <p role="alert" className="text-sm text-destructive">
              {adjust.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={adjust.isPending}
              onClick={onClose}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" className="h-11" disabled={!isValid || adjust.isPending}>
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
