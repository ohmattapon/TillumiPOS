import type { Branch } from '@pos/api/types'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateBranch, useUpdateBranch } from '../api'

interface Props {
  /** Omit to add a new branch. */
  branch?: Branch
  onClose: () => void
}

export function BranchFormDialog({ branch, onClose }: Props) {
  const { t } = useTranslation('branches')
  const { t: tc } = useTranslation()
  const [form, setForm] = useState({
    code: branch?.code ?? '',
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    phone: branch?.phone ?? '',
  })
  const set = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value })

  const create = useCreateBranch()
  const update = useUpdateBranch()
  const mutation = branch ? update : create

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const details = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
    }
    const onSuccess = (saved: Branch) => {
      toast.success(t(branch ? 'toast.updated' : 'toast.created', { name: saved.name }))
      onClose()
    }

    if (branch) update.mutate({ id: branch.id, changes: details }, { onSuccess })
    else create.mutate({ code: form.code.trim(), ...details }, { onSuccess })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex flex-col overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{branch ? t('form.titleEdit') : t('form.titleNew')}</DialogTitle>
          <DialogDescription>{t('form.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Only the fields scroll, so the confirm row stays at the bottom of the dialog. */}
          <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="branch-code">{t('form.code')}</Label>
              <Input
                id="branch-code"
                className="h-10 uppercase"
                value={form.code}
                onChange={(event) => set('code', event.target.value)}
                disabled={branch !== undefined}
                maxLength={10}
                required
                autoFocus={branch === undefined}
              />
              {!branch && <p className="text-xs text-muted-foreground">{t('form.codeHint')}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-name">{t('form.name')}</Label>
              <Input
                id="branch-name"
                className="h-10"
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                maxLength={100}
                required
                autoFocus={branch !== undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-address">{t('form.address')}</Label>
              <Input
                id="branch-address"
                className="h-10"
                value={form.address}
                onChange={(event) => set('address', event.target.value)}
                placeholder={t('form.optional')}
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-phone">{t('form.phone')}</Label>
              <Input
                id="branch-phone"
                className="h-10"
                value={form.phone}
                onChange={(event) => set('phone', event.target.value)}
                placeholder={t('form.optional')}
                maxLength={30}
              />
            </div>

            {mutation.error && (
              <p role="alert" className="text-sm text-destructive">
                {mutation.error.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" className="h-10" disabled={mutation.isPending}>
              {mutation.isPending ? t('form.saving') : t('form.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
