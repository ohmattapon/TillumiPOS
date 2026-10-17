import { CAFE_MENU_CATEGORIES, CAFE_MENU_ITEMS, planCafeMenu, type CafeMenuItem } from '@pos/api/cafe-menu'
import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { categoriesQuery } from '@/features/categories'
import { modifierGroupsQuery } from '@/features/modifiers'
import { useFormat } from '@/features/settings'
import { productsQuery, useApplyCafeMenu } from '../api'

/** Every item of the set, ticked to start with: the owner takes the whole menu and unticks what they do not sell. */
const ALL_KEYS = CAFE_MENU_ITEMS.map((item) => item.key)

/** The API caps a page at 1000; the preview needs every product once to see which items already exist. */
const CATALOGUE_LIMIT = 1000

const itemsOf = (categoryKey: string) => CAFE_MENU_ITEMS.filter((item) => item.categoryKey === categoryKey)

interface Props {
  onClose: () => void
}

/**
 * Adds the starter cafe menu in one go. The preview uses the same `planCafeMenu` rule the server applies,
 * so what the counter promises is what the shop gets: an item that already exists is skipped, never changed.
 */
export function CafeMenuDialog({ onClose }: Props) {
  const { t } = useTranslation('products')
  const { t: tc } = useTranslation()
  const { money } = useFormat()
  const [chosen, setChosen] = useState<string[]>(ALL_KEYS)

  const categories = useQuery(categoriesQuery)
  const groups = useQuery(modifierGroupsQuery)
  const products = useQuery(productsQuery({ includeInactive: true, limit: CATALOGUE_LIMIT }))
  const loading = categories.isPending || groups.isPending || products.isPending

  const plan = planCafeMenu(chosen, {
    categoryNames: categories.data?.map((category) => category.name) ?? [],
    groupNames: groups.data?.map((group) => group.name) ?? [],
    products: products.data?.items.map((product) => ({ sku: product.sku, name: product.name })) ?? [],
  })
  const skipped = new Set(plan.toSkip.map((item) => item.key))

  const apply = useApplyCafeMenu()

  const toggleItem = (key: string) =>
    setChosen((keys) => (keys.includes(key) ? keys.filter((chosenKey) => chosenKey !== key) : [...keys, key]))

  const toggleCategory = (items: readonly CafeMenuItem[]) => {
    const keys = items.map((item) => item.key)
    const allTicked = keys.every((key) => chosen.includes(key))
    setChosen((picked) =>
      allTicked ? picked.filter((key) => !keys.includes(key)) : [...new Set([...picked, ...keys])],
    )
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (chosen.length === 0 || loading || apply.isPending) return
    apply.mutate(chosen, {
      onSuccess: (result) => {
        toast.success(t('cafeMenu.added', { count: result.added.products }))
        if (result.skipped.items.length > 0)
          toast.info(
            t('cafeMenu.skipped', {
              count: result.skipped.products,
              names: result.skipped.items.map((item) => item.name).join(', '),
            }),
          )
        onClose()
      },
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('cafeMenu.title')}</DialogTitle>
          <DialogDescription>{t('cafeMenu.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="max-h-[55vh] space-y-4 overflow-y-auto">
            {loading && <p className="py-10 text-center text-sm text-muted-foreground">{t('cafeMenu.loading')}</p>}

            {!loading &&
              CAFE_MENU_CATEGORIES.map((category) => {
                const items = itemsOf(category.key)
                const ticked = items.filter((item) => chosen.includes(item.key)).length
                return (
                  <section key={category.key} className="space-y-2">
                    <label className="flex min-h-11 items-center gap-3 rounded-lg bg-muted/40 px-3">
                      <input
                        type="checkbox"
                        className="size-5 accent-primary"
                        checked={ticked === items.length}
                        ref={(element) => {
                          if (element) element.indeterminate = ticked > 0 && ticked < items.length
                        }}
                        onChange={() => toggleCategory(items)}
                      />
                      <span className="font-medium">{category.name}</span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {ticked}/{items.length}
                      </span>
                    </label>
                    <ul className="divide-y rounded-lg border">
                      {items.map((item) => (
                        <li key={item.key}>
                          <label className="flex min-h-11 items-center gap-3 px-3">
                            <input
                              type="checkbox"
                              className="size-5 accent-primary"
                              checked={chosen.includes(item.key)}
                              onChange={() => toggleItem(item.key)}
                            />
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            {skipped.has(item.key) && (
                              <span className="text-xs text-muted-foreground">{t('cafeMenu.exists')}</span>
                            )}
                            <span className="text-sm tabular-nums">{money.plain(item.priceSatang)}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}
          </div>

          <p className="text-xs text-muted-foreground">{t('cafeMenu.stockHint')}</p>

          {apply.error && (
            <p role="alert" className="text-sm text-destructive">
              {apply.error.message}
            </p>
          )}

          <DialogFooter className="items-center sm:justify-between">
            <p className="text-sm tabular-nums text-muted-foreground">
              {t('cafeMenu.preview', { added: plan.toCreate.items.length, skipped: plan.toSkip.length })}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-11" onClick={onClose}>
                {tc('cancel')}
              </Button>
              <Button type="submit" className="h-11" disabled={chosen.length === 0 || loading || apply.isPending}>
                {apply.isPending ? t('cafeMenu.submitting') : t('cafeMenu.submit')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
