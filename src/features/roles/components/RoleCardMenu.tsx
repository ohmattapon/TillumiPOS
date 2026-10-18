import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EllipsisVertical } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useDeleteRole, type Role } from '../api'
import { canDeleteRole } from '../lib/can-delete-role'
import { RoleDialog } from './RoleDialog'

/**
 * ⋯ menu for one role card: rename (opens the existing RoleDialog in edit mode)
 * and delete (confirm dialog, disabled when the role is a system role or still has users).
 *
 * Adding a role is the same RoleDialog in create mode (`<RoleDialog onClose={...} />`
 * with no `role` prop); the add button itself lives on the page and is out of scope here.
 */
export function RoleCardMenu({ role }: { role: Role }) {
  const { t } = useTranslation('roles'), { t: tc } = useTranslation()
  const [renaming, setRenaming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const remove = useDeleteRole()
  const deletable = canDeleteRole(role)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="size-11" aria-label={t('editTitle')}>
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>{t('edit')}</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" disabled={!deletable} onSelect={() => deletable && setRemoving(true)}>
            {t('remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {renaming && <RoleDialog role={role} onClose={() => setRenaming(false)} />}
      {removing && (
        <Dialog open onOpenChange={(open) => !open && setRemoving(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('deleteTitle')}</DialogTitle>
              <DialogDescription>{t('deleteHint', { name: role.name })}</DialogDescription>
            </DialogHeader>
            {remove.error && <p role="alert" className="text-sm text-destructive">{remove.error.message}</p>}
            <DialogFooter sticky>
              <Button variant="outline" className="h-11" onClick={() => setRemoving(false)}>{tc('cancel')}</Button>
              <Button
                variant="destructive"
                className="h-11"
                disabled={remove.isPending}
                onClick={() => remove.mutate(role.id, { onSuccess: () => { toast.success(t('removed')); setRemoving(false) } })}
              >
                {t('remove')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
