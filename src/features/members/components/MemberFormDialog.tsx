import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
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
import { type Member, useCreateMember, useUpdateMember } from '../api'

export function MemberFormDialog({
  member,
  onClose,
  onSaved,
}: {
  member?: Member
  onClose: () => void
  onSaved?: (member: Member) => void
}) {
  const { t } = useTranslation('members')
  const [name, setName] = useState(member?.name ?? '')
  const [phone, setPhone] = useState(member?.phone ?? '')
  const create = useCreateMember()
  const update = useUpdateMember()
  const mutation = member ? update : create
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const done = (saved: Member) => {
      toast.success(t('saved'))
      onSaved?.(saved)
      onClose()
    }
    if (member) update.mutate({ id: member.id, changes: { name: name.trim(), phone } }, { onSuccess: done })
    else create.mutate({ name: name.trim(), phone }, { onSuccess: done })
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t(member ? 'edit' : 'create')}</DialogTitle>
          <DialogDescription>{t('formHint')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="member-name">{t('name')}</FieldLabel>
              <Input
                id="member-name"
                autoFocus
                required
                maxLength={120}
                className="h-11"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="member-phone">{t('phone')}</FieldLabel>
              <Input
                id="member-phone"
                type="tel"
                autoComplete="tel"
                required
                maxLength={30}
                className="h-11"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
          </FieldGroup>
          {mutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={mutation.isPending}
              onClick={onClose}
            >
              {t('cancel')}
            </Button>
            <Button className="h-11" disabled={!name.trim() || !phone.trim() || mutation.isPending}>
              {t(mutation.isPending ? 'saving' : 'save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
