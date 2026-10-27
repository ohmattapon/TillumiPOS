import type { Product } from '@pos/api/types'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useFormat } from '@/features/settings'
import { cn } from '@/lib/utils'
import { unitChoices } from '../lib/units'

interface Props {
  product: Product
  onPick: (packId: number | undefined) => void
  onCancel: () => void
}

/**
 * Asks which unit to sell: single pieces or a whole pack. A tap on a unit puts it in the cart at once,
 * because the unit is the whole question (unlike options, which need a confirm step).
 */
export function UnitDialog({ product, onPick, onCancel }: Props) {
  const { t } = useTranslation('pos')
  const { money } = useFormat()
  const choices = unitChoices(product)

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>{t('units.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {choices.map((choice) => {
            const pieces = choice.packId === undefined
            return (
              <button
                key={choice.packId ?? 'pieces'}
                type="button"
                disabled={choice.shortOfStock}
                onClick={() => onPick(choice.packId)}
                className={cn(
                  'flex min-h-11 items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-left text-sm',
                  'outline-none hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-45',
                )}
              >
                <span>
                  <span className="block font-medium">
                    {pieces ? t('units.piece') : t('units.pack', { size: choice.size })}
                  </span>
                  {choice.shortOfStock && (
                    <span className="block text-xs text-muted-foreground">
                      {t('units.shortOfStock', { count: product.stockQty })}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{money.format(choice.unitPriceSatang)}</span>
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
