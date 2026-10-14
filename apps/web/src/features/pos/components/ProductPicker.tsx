import type { Product } from '@pos/api/types'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Kbd } from '@/components/Kbd'
import { PaginationBar } from '@/components/PaginationBar'
import { useListPagination } from '@/hooks/use-list-pagination'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { SegmentedTabs } from '@/components/SegmentedTabs'
import { SkeletonCardGrid } from '@/components/Skeletons'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { categoriesQuery, categoryColor } from '@/features/categories'
import { modifierGroupsQuery } from '@/features/modifiers'
import { isLowStock, isOutOfStock, ProductImage, productsQuery, productKeys } from '@/features/products'
import { useFormat } from '@/features/settings'
import { cn } from '@/lib/utils'
import { useActiveBranchStore } from '@/lib/active-branch'
import { hasKeyboard } from '../lib/focus'
import { offeredGroups } from '../lib/options'
import { useCartActions } from '../hooks/use-cart-actions'
import { useCartStore } from '../store/cart.store'
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
  const client = useQueryClient()
  const categories = useQuery(categoriesQuery)
  const modifiers = useQuery(modifierGroupsQuery)
  const { add: addToCart } = useCartActions()
  const [choosing, setChoosing] = useState<Product | null>(null)

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const term = useDebouncedValue(search.trim())
  const paging = useListPagination(`${category}:${search.trim()}`, 24)
  const products = useQuery(productsQuery({
    q: term, categoryId: category === 'all' ? undefined : Number(category),
    limit: paging.pageSize, offset: paging.offset,
  }))
  const searching = term !== search.trim()
  const visibleProducts = searching ? [] : products.data?.items ?? []
  const gridRef = useRef<HTMLDivElement>(null)
  const mounted = useRef(true)
  useEffect(() => { gridRef.current?.scrollTo({ top: 0 }) }, [paging.page, category, term])

  // F2 jumps back to the search box from anywhere on the page.
  useEffect(() => {
    mounted.current = true
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F2') return
      event.preventDefault()
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { mounted.current = false; window.removeEventListener('keydown', onKeyDown) }
  }, [searchRef])

  const pick = (product: Product) => {
    client.setQueryData(productKeys.detail(product.id), product)
    // A product with option groups is asked about them first; one without goes straight into the cart.
    if (offeredGroups(modifiers.data ?? [], product.id).length > 0) {
      setChoosing(product)
      return
    }
    addToCart(product.id)
    if (hasKeyboard()) searchRef.current?.focus()
  }

  // A USB barcode scanner types the code and presses Enter, which lands here.
  const submitSearch = async (event: FormEvent) => {
    event.preventDefault()
    const code = search.trim()
    if (code === '') return
    const term = code.toLowerCase()
    const branchId = useActiveBranchStore.getState().branchId
    const orderId = useCartStore.getState().orderId
    // Free the input immediately so a second scan is not erased when the first request finishes.
    setSearch('')
    try {
      // A scan must also find products beyond the displayed page or category.
      const exact = code.length <= 64 ? await client.fetchQuery(productsQuery({ code, limit: 2 })) : { items: [], total: 0 }
      const result = exact.total > 0 ? exact : await client.fetchQuery(productsQuery({ q: code, limit: 2 }))
      if (!mounted.current || useActiveBranchStore.getState().branchId !== branchId || useCartStore.getState().orderId !== orderId) return
      const match = result.items.find((product) => product.barcode === code)
        ?? (exact.total > 0 ? result.items.find((product) => product.sku.toLowerCase() === term) : undefined)
        ?? (result.total === 1 ? result.items[0] : undefined)
      if (!match) toast.error(t('picker.notFound', { term: code }))
      else if (isOutOfStock(match)) toast.error(t('picker.outOfStock', { name: match.name }))
      else pick(match)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tc('connectionFailed'))
    }
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
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
        {categories.isPending ? (
          <Skeleton className="h-13 w-72 rounded-xl" />
        ) : (
          <SegmentedTabs
            size="touch"
            value={category}
            onChange={setCategory}
            options={[
              { value: 'all', label: tc('all') },
              ...(categories.data ?? [])
                .filter((item) => item.isActive)
                .map((item) => ({ value: String(item.id), label: item.name, dot: categoryColor(item.id) })),
            ]}
          />
        )}
      </div>

      {products.error && <p className="text-sm text-destructive">{products.error.message}</p>}
      <div ref={gridRef} className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 overflow-y-auto pb-1">
        {(products.isPending || searching) && <SkeletonCardGrid className="contents" count={8} />}
        {visibleProducts.map((product) => (
          <button
            key={product.id}
            disabled={isOutOfStock(product)}
            onClick={() => pick(product)}
            // A strip in the category's colour along the top, so a category can be found by colour at a glance.
            style={product.categoryId ? { borderTopColor: categoryColor(product.categoryId) } : undefined}
            className="flex flex-col border-t-4 overflow-hidden rounded-xl border bg-card text-left shadow-xs transition-colors outline-none hover:border-primary/50 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent disabled:pointer-events-none disabled:opacity-45"
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
        {!products.isPending && !searching && visibleProducts.length === 0 && (
          <p className="col-span-full py-12 text-center text-muted-foreground">{t('picker.noMatches')}</p>
        )}
      </div>
      <PaginationBar {...paging} total={products.data?.total} isLoading={products.isFetching || searching} onPageChange={paging.setPage} />
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
