import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MemberPickerDialog } from '@/features/members'
import { useSetOrderMember } from '@/features/orders'
import { useCart } from '../hooks/use-cart'
import { useCartStore } from '../store/cart.store'

export function CartMember() {
  const { t } = useTranslation('members')
  const cart = useCart()
  const setLocal = useCartStore((state) => state.setMember)
  const update = useSetOrderMember()
  const [choosing, setChoosing] = useState(false)
  const select = (memberId: number | null) => {
    if (cart.orderId !== null)
      update.mutate({ orderId: cart.orderId, memberId }, { onSuccess: () => setChoosing(false) })
    else {
      setLocal(memberId)
      setChoosing(false)
    }
  }
  return (
    <div className="flex shrink-0 flex-col gap-1 border-b px-4 py-2">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          className="h-11 min-w-0 flex-1 justify-start px-0"
          disabled={update.isPending}
          onClick={() => setChoosing(true)}
        >
          <UserRound data-icon="inline-start" />
          <span className="truncate">
            {cart.member?.name ?? (cart.memberId ? t('selected') : t('anonymous'))}
          </span>
        </Button>
        {cart.memberId !== null && (
          <Button
            variant="ghost"
            className="size-11 shrink-0"
            aria-label={t('remove')}
            disabled={update.isPending}
            onClick={() => select(null)}
          >
            <X />
          </Button>
        )}
      </div>
      {cart.member && (
        <p className="text-xs text-muted-foreground">
          {cart.member.code} / {cart.member.phone}
        </p>
      )}
      {cart.member && !cart.member.isActive && (
        <p role="alert" className="text-xs text-destructive">
          {t('inactiveHint')}
        </p>
      )}
      {(cart.memberError || update.error) && (
        <p role="alert" className="text-xs text-destructive">
          {(cart.memberError ?? update.error)?.message}
        </p>
      )}
      {choosing && (
        <MemberPickerDialog onClose={() => setChoosing(false)} onSelect={(member) => select(member.id)} />
      )}
    </div>
  )
}
