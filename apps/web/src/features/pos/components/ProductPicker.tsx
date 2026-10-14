import type { Product } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Kbd } from '@/components/Kbd'
import { SegmentedTabs } from '@/components/SegmentedTabs'
import { Input } from '@/components/ui/input'
import { categoriesQuery } from '@/features/categories'
import { modifierGroupsQuery } from '@/features/modifiers'
import { isLowStock, isOutOfStock, ProductImage, productsQuery } from '@/features/products'
import { useFormat } from '@/features/settings'
import { cn } from '@/lib/utils'
import { hasKeyboard } from '../lib/focus'
import { offeredGroups } from '../lib/options'
import { useCartActions } from '../hooks/use-cart-actions'
import { OptionsDialog } from './OptionsDialog'

interface Props {
  /** Owned by the page so it can also return focus here after a sale. */
  searchRef: RefObject<HTMLInputElement | null>
}

/** Search box, category filter and product grid. Picking a product puts it in the cart. */
export function ProductPicker({ searchRef }: Props) {
  const { t } = useTranslation('pos')
  const { t: tc } = useTranslation()
  const { money } = useFormat()
  const products = useQuery(productsQuery())
  const categories = useQuery(categoriesQuery)
  const modifiers = useQuery(modifierGroupsQuery)
  const { add: addToCart } = useCartActions()
  const [choosing, setChoosing] = useState<Product | null>(null)

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (products.data ?? []).filter(
      (product) =>
        (category === 'all' || String(product.categoryId) === category) &&
        (term === '' ||
          product.name.toLowerCase().includes(term) ||
          product.sku.toLowerCase().includes(term) ||
          product.barcode === term),
    )
  }, [products.data, search, category])

  // F2 jumps back to the search box from anywhere on the page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F2') return
      event.preventDefault()
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [searchRef])

  const pick = (product: Product) => {
    // A product with option groups is asked about them first; one without goes straight into the cart.
    if (offeredGroups(modifiers.data ?? [], product.id).length > 0) {
      setChoosing(product)
      return
    }
    addToCart(product.id)
    if (hasKeyboard()) searchRef.current?.focus()
  }

  // A USB barcode scanner types the code and presses Enter, which lands here.
  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    const term = search.trim().toLowerCase()
    if (term === '') return
    const match =
      products.data?.find((product) => product.barcode === term || product.sku.toLowerCase() === term) ??
      (visibleProducts.length === 1 ? visibleProducts[0] : undefined)
    if (!match) toast.error(t('picker.notFound', { term: search.trim() }))
    else if (isOutOfStock(match)) toast.error(t('picker.outOfStock', { name: match.name }))
    else pick(match)
    setSearch('')
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3 p-4">
      <form onSubmit={submitSearch} className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          className="h-12 pr-14 pl-11 text-base!"
          placeholder={t('picker.searchPlaceholder')}
          aria-label={t('picker.searchLabel')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          autoFocus
        />
        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">
          <Kbd>F2</Kbd>
        </span>
      </form>

      <div className="-mx-4 overflow-x-auto px-4">
        <SegmentedTabs
          size="touch"
          value={category}
          onChange={setCategory}
          options={[
            { value: 'all', label: tc('all') },
            ...(categories.data ?? [])
              .filter((item) => item.isActive)
              .map((item) => ({ value: String(item.id), label: item.name })),
          ]}
        />
      </div>

      {products.error && <p className="text-sm text-destructive">{products.error.message}</p>}
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 overflow-y-auto pb-1">
        {visibleProducts.map((product) => (
          <button
            key={product.id}
            disabled={isOutOfStock(product)}
            onClick={() => pick(product)}
            className="flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-xs transition-colors outline-none hover:border-primary/50 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent disabled:pointer-events-none disabled:opacity-45"
          >
            {/* No picture, no empty box: the name and price take the space. */}
            {product.imageUrl && <ProductImage src={product.imageUrl} alt="" className="aspect-[4/3] w-full" />}
            <span className={cn('line-clamp-2 min-h-12 px-3 text-base leading-snug font-medium', product.imageUrl ? 'pt-2' : 'pt-3')}>
              {product.name}
            </span>
            <span className="flex items-end justify-between gap-2 px-3 pt-1 pb-3">
              <span className="text-lg font-semibold tabular-nums">{money.format(product.priceSatang)}</span>
              {product.trackStock && (
                <span
                  className={cn(
                    'text-xs tabular-nums',
                    isLowStock(product) ? 'font-medium text-warning' : 'text-muted-foreground',
                  )}
                >
                  {isOutOfStock(product) ? t('picker.soldOut') : t('picker.left', { count: product.stockQty })}
                </span>
              )}
            </span>
          </button>
        ))}
        {!products.isPending && visibleProducts.length === 0 && (
          <p className="col-span-full py-12 text-center text-muted-foreground">{t('picker.noMatches')}</p>
        )}
      </div>
      {choosing && (
        <OptionsDialog
          product={choosing}
          groups={offeredGroups(modifiers.data ?? [], choosing.id)}
          onCancel={() => setChoosing(null)}
          onConfirm={(optionIds) => {
            addToCart(choosing.id, optionIds)
            setChoosing(null)
            if (hasKeyboard()) searchRef.current?.focus()
          }}
        />
      )}
    </section>
  )
}
