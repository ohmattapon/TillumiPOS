import type { ModifierGroup, Product } from '@pos/api/types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useFormat } from '@/features/settings'
import { cn } from '@/lib/utils'
import { chooseOptions, preselectedOptionIds } from '../lib/options'

interface Props {
  product: Product
  /** The groups to ask, already limited to what can be chosen (see offeredGroups). */
  groups: ModifierGroup[]
  onConfirm: (optionIds: number[]) => void
  onCancel: () => void
}

/** Asks for the options of a product before it goes in the cart; confirm is enabled only when the choice is allowed. */
export function OptionsDialog({ product, groups, onConfirm, onCancel }: Props) {
  const { t } = useTranslation('pos')
  const { t: tc } = useTranslation()
  const { money } = useFormat()
  // Starts on the group defaults: the common drink is confirmed in one tap, and the picks are sent as they are.
  const [chosen, setChosen] = useState<number[]>(() => preselectedOptionIds(groups))

  const resolved = chooseOptions(groups, chosen)
  const unitPriceSatang = product.priceSatang + (resolved?.priceSatang ?? 0)

  const toggle = (group: ModifierGroup, optionId: number) => {
    const inGroup = chosen.filter((id) => group.options.some((option) => option.id === id))
    if (chosen.includes(optionId)) {
      setChosen(chosen.filter((id) => id !== optionId))
    } else if (group.maxSelections === 1) {
      // Picking another of a pick-one group replaces the choice.
      setChosen([...chosen.filter((id) => !inGroup.includes(id)), optionId])
    } else if (inGroup.length < group.maxSelections) {
      setChosen([...chosen, optionId])
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>{t('options.description')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {groups.map((group) => {
            const inGroup = chosen.filter((id) => group.options.some((option) => option.id === id))
            const single = group.maxSelections === 1
            return (
              <fieldset key={group.id} className="space-y-2">
                <legend className="flex w-full items-baseline justify-between gap-2 text-sm font-medium">
                  <span>{group.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {group.required ? t('options.required') : t('options.optional')}
                    {', '}
                    {single ? t('options.pickOne') : t('options.pickUpTo', { count: group.maxSelections })}
                  </span>
                </legend>
                <div role={single ? 'radiogroup' : 'group'} aria-label={group.name} className="flex flex-wrap gap-2">
                  {group.options.map((option) => {
                    const selected = chosen.includes(option.id)
                    const full = !single && !selected && inGroup.length >= group.maxSelections
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role={single ? 'radio' : 'checkbox'}
                        aria-checked={selected}
                        disabled={full}
                        onClick={() => toggle(group, option.id)}
                        className={cn(
                          'min-h-11 rounded-lg border px-3 py-2 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-45',
                          selected ? 'border-primary bg-primary/10 text-primary' : 'bg-background hover:bg-accent/40',
                        )}
                      >
                        <span className="block font-medium">{option.name}</span>
                        {option.priceSatang > 0 && (
                          <span className="block text-xs tabular-nums">+{money.plain(option.priceSatang)}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            )
          })}
        </div>

        <DialogFooter sticky className="items-center sm:justify-between">
          <p className="text-lg font-semibold tabular-nums">{money.format(unitPriceSatang)}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
              {tc('cancel')}
            </Button>
            <Button type="button" className="h-11" disabled={resolved === null} onClick={() => onConfirm(chosen)}>
              {t('options.add')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
