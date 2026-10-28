import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MemberPickerDialog } from '@/features/members'
import { useSetOrderMember } from '@/features/orders'
import { useCart } from '../hooks/use-cart'
import { useCartStore } from '../store/cart.store'

export function CartMember() {
  const { t } = useTranslation('members')
  const { t: tp } = useTranslation('pos')
  const cart = useCart()
  const setLocal = useCartStore((state) => state.setMember)
  const setRedeemPoints = useCartStore((state) => state.setRedeemPoints)
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
  const typedDiscount = cart.discountSatang > 0
  // The store holds the numbers, so the member change that drops them empties the field too.
  const pointsInput = cart.redeemPoints === 0 ? '' : String(cart.redeemPoints)
  const changePoints = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 7)
    setRedeemPoints(digits === '' ? 0 : Number(digits))
  }
  const fillMax = () => setRedeemPoints(cart.maxRedeemPoints)
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
      {cart.canRedeemPoints && (
        <div className="flex items-end gap-2">
          <label htmlFor="cart-redeem-points" className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {tp('cart.pointsBalance', { points: cart.pointsBalance })}
            </span>
            <Input
              id="cart-redeem-points"
              className="h-11 text-right tabular-nums"
              inputMode="numeric"
              autoComplete="off"
              aria-label={tp('cart.pointsRedeem')}
              value={pointsInput}
              disabled={typedDiscount}
              onChange={(event) => changePoints(event.target.value)}
            />
          </label>
          <Button
            variant="outline"
            className="h-11 shrink-0"
            disabled={typedDiscount || cart.maxRedeemPoints === 0}
            onClick={fillMax}
          >
            {tp('cart.pointsMax')}
          </Button>
        </div>
      )}
      {cart.canRedeemPoints && typedDiscount && (
        <p className="text-xs text-muted-foreground">{tp('cart.pointsNotWithDiscount')}</p>
      )}
      {cart.canRedeemPoints && !typedDiscount && cart.redeemPoints > 0 && cart.pointsRedeemed === 0 && (
        <p role="alert" className="text-xs text-destructive">
          {tp('cart.pointsNotApplied')}
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
