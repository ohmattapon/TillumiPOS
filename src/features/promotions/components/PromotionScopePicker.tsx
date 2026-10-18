import { useQueries, useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { categoriesQuery } from '@/features/categories'
import { productQuery, productsQuery } from '@/features/products'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { scopeEntries, toggleId, type ScopeSelection } from '../lib/promotion-scope'

const SEARCH_LIMIT = 20
const MAX_RETRIES = 3

/** A product that is gone answers 404 at once; asking again would only keep it "loading". */
const retryUnlessGone = (failures: number, error: Error) =>
  !(error instanceof ApiError && error.status === 404) && failures < MAX_RETRIES

/** Chooses the categories and products a promotion is limited to; nothing chosen is the whole bill. */
export function PromotionScopePicker({ value, onChange }: { value: ScopeSelection; onChange: (value: ScopeSelection) => void }) {
  const { t } = useTranslation('promotions')
  const categories = useQuery(categoriesQuery)
  const [search, setSearch] = useState('')
  const term = useDebouncedValue(search.trim())
  const results = useQuery({ ...productsQuery({ q: term, limit: SEARCH_LIMIT, offset: 0 }), enabled: term !== '' })
  // The chosen products are read one by one, so a chosen product that no search shows still has its name.
  const chosen = useQueries({ queries: value.productIds.map((id) => ({ ...productQuery(id), retry: retryUnlessGone })) })
  const failed = chosen.filter((result) => result.error && !(result.error instanceof ApiError && result.error.status === 404))

  const knownProducts = new Map(chosen.flatMap((result) => (result.data ? [[result.data.id, result.data] as const] : [])))
  const loadingProducts = new Set(value.productIds.filter((_, index) => chosen[index]?.isPending))
  const productEntries = scopeEntries(value.productIds, knownProducts, loadingProducts)
  const knownCategories = new Map((categories.data ?? []).map((category) => [category.id, category] as const))
  // A chosen category no longer listed stays visible, so it can be taken out.
  const goneCategories = categories.data ? scopeEntries(value.categoryIds, knownCategories).filter((entry) => entry.status === 'missing') : []

  const toggleProduct = (id: number) => onChange({ ...value, productIds: toggleId(value.productIds, id) })
  const toggleCategory = (id: number) => onChange({ ...value, categoryIds: toggleId(value.categoryIds, id) })
  const showResults = term !== '' && term === search.trim()

  return (
    <Field>
      <FieldLabel>{t('scope.title')}</FieldLabel>
      <p className="text-xs text-muted-foreground">{t('scope.hint')}</p>

      <div className="flex flex-col gap-2" role="group" aria-label={t('scope.categories')}>
        <p className="text-sm font-medium">{t('scope.categories')}</p>
        {categories.error && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            {categories.error.message}
            <Button type="button" variant="outline" className="h-11" onClick={() => void categories.refetch()}>{t('scope.retry')}</Button>
          </div>
        )}
        {categories.isPending && <p className="text-sm text-muted-foreground">{t('scope.loading')}</p>}
        {categories.data?.length === 0 && goneCategories.length === 0 && <p className="text-sm text-muted-foreground">{t('scope.noCategories')}</p>}
        <div className="flex flex-wrap gap-2">
          {categories.data?.map((category) => (
            <button
              key={category.id} type="button" aria-pressed={value.categoryIds.includes(category.id)} onClick={() => toggleCategory(category.id)}
              className={cn(
                'inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                value.categoryIds.includes(category.id) ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted',
              )}
            >
              {category.name}
              {!category.isActive && <StatusBadge tone="neutral">{t('scope.inactive')}</StatusBadge>}
            </button>
          ))}
          {goneCategories.map((entry) => (
            <Button
              key={entry.id} type="button" variant="outline" className="h-11 border-warning"
              aria-label={t('scope.remove', { name: t('scope.missing', { id: entry.id }) })} onClick={() => toggleCategory(entry.id)}
            >
              {t('scope.missing', { id: entry.id })}
              <X />
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t('scope.products')}</p>
        {failed.length > 0 && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            {failed[0]!.error!.message}
            <Button type="button" variant="outline" className="h-11" onClick={() => failed.forEach((result) => void result.refetch())}>{t('scope.retry')}</Button>
          </div>
        )}
        {productEntries.length > 0 && (
          <ul aria-label={t('scope.chosen')} className="divide-y rounded-lg border">
            {productEntries.map((entry) => {
              const label = entry.name ?? (entry.status === 'loading' ? t('scope.loading') : t('scope.missing', { id: entry.id }))
              return (
                <li key={entry.id} className="flex min-h-11 items-center gap-2 pl-3 text-sm">
                  <span className={cn('min-w-0 flex-1 truncate', entry.status === 'missing' && 'text-warning')}>{label}</span>
                  {entry.status === 'inactive' && <StatusBadge tone="neutral">{t('scope.inactive')}</StatusBadge>}
                  <Button type="button" variant="ghost" className="size-11" aria-label={t('scope.remove', { name: label })} onClick={() => toggleProduct(entry.id)}>
                    <X />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        <label htmlFor="promotion-scope-search" className="sr-only">{t('scope.search')}</label>
        <Input
          id="promotion-scope-search" type="search" className="h-11" placeholder={t('scope.search')}
          value={search} onChange={(event) => setSearch(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t('scope.searchHint')}</p>
        {results.error && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            {results.error.message}
            <Button type="button" variant="outline" className="h-11" onClick={() => void results.refetch()}>{t('scope.retry')}</Button>
          </div>
        )}
        {term !== '' && !showResults && <p className="text-sm text-muted-foreground">{t('scope.loading')}</p>}
        {showResults && results.isPending && <p className="text-sm text-muted-foreground">{t('scope.loading')}</p>}
        {showResults && results.data?.items.length === 0 && <p className="text-sm text-muted-foreground">{t('scope.noResults')}</p>}
        {showResults && (results.data?.items.length ?? 0) > 0 && (
          <ul className="divide-y rounded-lg border">
            {results.data!.items.map((product) => (
              <li key={product.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm hover:bg-muted/50">
                  <input
                    type="checkbox" className="size-4 shrink-0 accent-primary"
                    checked={value.productIds.includes(product.id)} onChange={() => toggleProduct(product.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{product.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{product.sku}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  )
}
