import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { PaginationBar } from '@/components/PaginationBar'
import { Panel } from '@/components/Panel'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCan } from '@/features/auth'
import { useFormat } from '@/features/settings'
import { useListPagination } from '@/hooks/use-list-pagination'
import { promotionsQuery, useUpdatePromotion, type Promotion } from '../api'
import { bpToPercent, timeOf, weekdayName } from '../lib/promotion-form'
import { PromotionFormDialog } from './PromotionFormDialog'

/** The owner sets promotions up; a cashier can read them so they know what the till will give. */
export function PromotionsPage() {
  const { t } = useTranslation('promotions')
  const { money, date, locale } = useFormat()
  const isOwner = useCan('promotions.write')
  const promotions = useQuery(promotionsQuery({ limit: 500 }))
  const update = useUpdatePromotion()
  const [dialog, setDialog] = useState<{ promotion?: Promotion } | null>(null)
  const paging = useListPagination('promotions')
  const all = promotions.data?.items ?? []

  const discountText = (promotion: Promotion) => {
    if (promotion.kind === 'bundle')
      return t('summary.bundle', { buy: promotion.buyQuantity ?? 0, free: promotion.freeQuantity ?? 0 })
    if (promotion.kind === 'fixed') return t('summary.fixed', { amount: money.format(promotion.value) })
    const percent = bpToPercent(promotion.value)
    return promotion.maxDiscountSatang === null
      ? t('summary.percent', { percent })
      : t('summary.percentCapped', { percent, max: money.format(promotion.maxDiscountSatang) })
  }

  // Reserved and paid bills both count, so a limit shows the room left before the till refuses it.
  const usesText = (promotion: Promotion) =>
    promotion.maxUses === null
      ? t('uses.unlimited', { used: promotion.usedCount })
      : t('uses.count', { used: promotion.usedCount, max: promotion.maxUses })

  const whenText = (promotion: Promotion) => {
    const parts: string[] = []
    if (promotion.minSubtotalSatang > 0) parts.push(t('when.minimum', { amount: money.format(promotion.minSubtotalSatang) }))
    if (promotion.startsOn && promotion.endsOn)
      parts.push(t('when.between', { from: date.calendarDate(promotion.startsOn), to: date.calendarDate(promotion.endsOn) }))
    else if (promotion.startsOn) parts.push(t('when.from', { date: date.calendarDate(promotion.startsOn) }))
    else if (promotion.endsOn) parts.push(t('when.until', { date: date.calendarDate(promotion.endsOn) }))
    if (promotion.weekdays && promotion.weekdays.length > 0)
      parts.push(t('when.onDays', { days: promotion.weekdays.map((day) => weekdayName(locale, day)).join(' ') }))
    if (promotion.windowStartMinute !== null && promotion.windowEndMinute !== null)
      parts.push(t('when.window', { start: timeOf(promotion.windowStartMinute), end: timeOf(promotion.windowEndMinute) }))
    return parts.length > 0 ? parts.join(', ') : t('when.always')
  }

  const setActive = (promotion: Promotion, isActive: boolean) =>
    update.mutate(
      { id: promotion.id, changes: { isActive } },
      {
        onSuccess: () => toast.success(t(isActive ? 'toast.activated' : 'toast.deactivated', { name: promotion.name })),
        onError: (error) => toast.error(error.message),
      },
    )

  return (
    <>
      <PageHeader title={t('title')} description={t('description')}>
        {isOwner && (
          <Button className="h-11 px-3" onClick={() => setDialog({})}>
            <Plus />
            {t('create')}
          </Button>
        )}
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Panel title={t('list.title')} description={isOwner ? t('list.description') : t('list.readOnly')}>
          {promotions.error && (
            <p role="alert" className="p-4 text-sm text-destructive">
              {promotions.error.message}
              <Button variant="link" className="h-11" onClick={() => void promotions.refetch()}>{t('retry')}</Button>
            </p>
          )}
          {!promotions.error && (
            <DataTable
              rows={all.slice(paging.offset, paging.offset + paging.pageSize)}
              rowKey={(promotion) => promotion.id}
              isPending={promotions.isPending}
              empty={t('list.empty')}
              muted={(promotion) => !promotion.isActive}
              columns={[
                { id: 'name', header: t('columns.name'), priority: 'primary', className: 'font-medium', cell: (promotion) => promotion.name },
                { id: 'discount', header: t('columns.discount'), priority: 'primary', cell: discountText },
                { id: 'uses', header: t('columns.uses'), priority: 'secondary', cell: usesText },
                { id: 'when', header: t('columns.when'), priority: 'secondary', cell: whenText },
                {
                  id: 'audience', header: t('columns.audience'), priority: 'wide-only',
                  cell: (promotion) => t(`audience.${promotion.audience}`),
                },
                {
                  id: 'status', header: t('columns.status'), priority: 'secondary',
                  cell: (promotion) =>
                    promotion.isExhausted ? (
                      <StatusBadge tone="warning">{t('status.exhausted')}</StatusBadge>
                    ) : (
                      <StatusBadge tone={promotion.isActive ? 'success' : 'neutral'}>
                        {promotion.isActive ? t('status.active') : t('status.inactive')}
                      </StatusBadge>
                    ),
                },
              ]}
              actions={
                isOwner
                  ? (promotion) => (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="size-11" aria-label={t('actions.more', { name: promotion.name })}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDialog({ promotion })}>{t('actions.edit')}</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setActive(promotion, !promotion.isActive)}>
                            {promotion.isActive ? t('actions.deactivate') : t('actions.activate')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )
                  : undefined
              }
            />
          )}
          <PaginationBar {...paging} total={all.length} isLoading={promotions.isFetching} onPageChange={paging.setPage} />
        </Panel>
      </div>

      {dialog && <PromotionFormDialog promotion={dialog.promotion} onClose={() => setDialog(null)} />}
    </>
  )
}
