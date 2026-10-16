import { SHOP_TYPES, type ShopType } from '@pos/api/shop-settings'
import { Coffee, ShoppingBasket, Store, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

const ICONS: Record<ShopType, LucideIcon> = {
  cafe: Coffee,
  restaurant: UtensilsCrossed,
  retail: ShoppingBasket,
  other: Store,
}

/** The kind of shop, which decides the features it starts with. Nothing is chosen until the owner picks. */
export function ShopTypeChoice({ value, onChange }: { value: ShopType | null; onChange: (type: ShopType) => void }) {
  const { t } = useTranslation('setup')

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{t('shopType.legend')}</legend>
      <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
        {SHOP_TYPES.map((type) => {
          const Icon = ICONS[type]
          return (
            <label
              key={type}
              className={cn(
                'flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                value === type && 'border-primary bg-primary/5',
              )}
            >
              <input
                type="radio"
                name="shop-type"
                className="sr-only"
                checked={value === type}
                onChange={() => onChange(type)}
              />
              <Icon className={cn('mt-0.5 size-5 shrink-0', value === type ? 'text-primary' : 'text-muted-foreground')} />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{t(`shopType.${type}.name`)}</span>
                <span className="block text-xs text-muted-foreground">{t(`shopType.${type}.hint`)}</span>
              </span>
            </label>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">{t('shopType.note')}</p>
    </fieldset>
  )
}
