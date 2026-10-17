import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Panel'
import { PaginationBar } from '@/components/PaginationBar'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PERMISSIONS } from '@pos/api/permissions'
import { rolesQuery, useDeleteRole, type Role } from '../api'
import { RoleDialog } from './RoleDialog'

export function RolesPage() {
  const { t } = useTranslation('roles'), { t: tc } = useTranslation()
  const [page, setPage] = useState(0)
  const roles = useQuery(rolesQuery(50, page * 50))
  const [dialog, setDialog] = useState<{ role?: Role } | null>(null)
  const [removing, setRemoving] = useState<Role | null>(null)
  const remove = useDeleteRole()
  return <>
    <PageHeader title={t('title')} description={t('description')}><Button className="h-11" onClick={() => setDialog({})}><Plus />{t('add')}</Button></PageHeader>
    <div className="min-h-0 flex-1 overflow-y-auto p-4"><Panel title={t('title')}>
      {roles.error && <p role="alert" className="p-4 text-sm text-destructive">{roles.error.message}</p>}
      <DataTable rows={roles.data?.items ?? []} rowKey={(role) => role.id} empty={t('empty')} isPending={roles.isPending} columns={[
        { id: 'name', header: t('name'), priority: 'primary', cell: (role) => <span className="font-medium">{role.name}{role.systemKey && <span className="ml-2 text-xs font-normal text-muted-foreground">{t('system')}</span>}</span> },
        { id: 'users', header: t('users'), priority: 'secondary', align: 'right', cell: (role) => role.userCount },
        { id: 'permissions', header: t('permissions'), priority: 'wide-only', align: 'right', cell: (role) => role.systemKey === 'owner' ? PERMISSIONS.length : role.permissions.length },
      ]} actions={(role) => <div className="flex gap-1"><Button variant="ghost" className="h-11" onClick={() => setDialog({ role })}>{t('edit')}</Button><Button variant="ghost" className="h-11 text-destructive" disabled={Boolean(role.systemKey) || role.userCount > 0} onClick={() => setRemoving(role)}>{t('remove')}</Button></div>} />
      <PaginationBar page={page} pageSize={50} total={roles.data?.total} isLoading={roles.isPending} onPageChange={setPage} />
    </Panel></div>
    {dialog && <RoleDialog role={dialog.role} onClose={() => setDialog(null)} />}
    {removing && <ConfirmDialog open onOpenChange={(open) => !open && setRemoving(null)} title={t('deleteTitle')} description={t('deleteHint', { name: removing.name })} confirmLabel={t('remove')} cancelLabel={tc('cancel')} destructive pending={remove.isPending} onConfirm={() => remove.mutate(removing.id, { onSuccess: () => { toast.success(t('removed')); setRemoving(null) } })}>
      {remove.error && <p role="alert" className="text-sm text-destructive">{remove.error.message}</p>}
    </ConfirmDialog>}
  </>
}
