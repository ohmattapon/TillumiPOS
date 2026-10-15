import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PaginationBar } from '@/components/PaginationBar'
import { membersQuery, type Member } from '../api'
import { MemberFormDialog } from './MemberFormDialog'

export function MemberPickerDialog({
  onSelect,
  onClose,
}: {
  onSelect: (member: Member) => void
  onClose: () => void
}) {
  const { t } = useTranslation('members')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  const members = useQuery(
    membersQuery({ search: search.trim() || undefined, isActive: true, limit: 10, offset: page * 10 }),
  )
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('select')}</DialogTitle>
            <DialogDescription>{t('search')}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              autoFocus
              aria-label={t('search')}
              placeholder={t('search')}
              className="h-11 min-w-0"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(0)
              }}
            />
            <Button
              variant="outline"
              className="size-11 shrink-0"
              aria-label={t('create')}
              onClick={() => setCreating(true)}
            >
              <Plus />
            </Button>
          </div>
          <div className="min-h-0 overflow-y-auto">
            {members.isPending && <Skeleton className="h-28 w-full" />}
            {members.error && (
              <p role="alert" className="text-sm text-destructive">
                {members.error.message}
                <Button variant="link" onClick={() => void members.refetch()}>
                  {t('retry')}
                </Button>
              </p>
            )}
            {members.data?.items.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>
            )}
            <ul className="divide-y">
              {members.data?.items.map((member) => (
                <li key={member.id}>
                  <Button
                    variant="ghost"
                    className="h-auto min-h-14 w-full justify-start py-3 text-left"
                    onClick={() => onSelect(member)}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{member.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {member.code} / {member.phone}
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
          <PaginationBar
            page={page}
            pageSize={10}
            total={members.data?.total}
            isLoading={members.isPending}
            onPageChange={setPage}
          />
        </DialogContent>
      </Dialog>
      {creating && <MemberFormDialog onClose={() => setCreating(false)} onSaved={onSelect} />}
    </>
  )
}
