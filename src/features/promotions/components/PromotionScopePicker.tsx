import { useQueries, useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MultiSelectCombobox } from '@/components/MultiSelectCombobox'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { categoriesQuery } from '@/features/categories'
import { ProductImage, productQuery, productsQuery } from '@/features/products'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { scopeEntries, toggleId, type ScopeSelection } from '../lib/promotion-scope'

const SEARCH_LIMIT = 20
const MAX_RETRIES = 3

/** A product that is gone answers 404 at once; asking again would only keep it "loading". */
const retryUnlessGone = (failures: number, error: Error) =>
  !(error instanceof ApiError && error.status === 404) && failures < MAX_RETRIES

const thumbnail = (imageUrl: string | null | undefined) => <ProductImage src={imageUrl ?? null} alt="" className="size-8 rounded-md" />

/** Chooses the categories and products a promotion is limited to; nothing chosen is the whole bill. */
export function PromotionScopePicker({ value, onChange }: { value: ScopeSelection; onChange: (value: ScopeSelection) => void }) {
  const { t } = useTranslation('promotions')
  const categories = useQuery(categoriesQuery)
  const [search, setSearch] = useState('')
  const term = useDebouncedValue(search.trim())
  const results = useQuery(productsQuery({ q: term, limit: SEARCH_LIMIT, offset: 0 }))
  // The chosen products are read one by one, so a chosen product that no search shows still has its name.
  const chosen = useQueries({ queries: value.productIds.map((id) => ({ ...productQuery(id), retry: retryUnlessGone })) })
  const failed = chosen.filter((result) => result.error && !(result.error instanceof ApiError && result.error.status === 404))

  const knownProducts = new Map(chosen.flatMap((result) => (result.data ? [[result.data.id, result.data] as const] : [])))
  const loadingProducts = new Set(value.productIds.filter((_, index) => chosen[index]?.isPending))
  const productEntries = scopeEntries(value.productIds, knownProducts, loadingProducts)
  const knownCategories = new Map((categories.data ?? []).map((category) => [category.id, category] as const))
  const categoryEntries = scopeEntries(value.categoryIds, knownCategories)

  const toggleProduct = (id: number) => onChange({ ...value, productIds: toggleId(value.productIds, id) })
  const toggleCategory = (id: number) => onChange({ ...value, categoryIds: toggleId(value.categoryIds, id) })
  const settled = term === search.trim()
  const found = results.data?.items ?? []

  const countOr = (count: number, pick: string) => (count > 0 ? t('scope.selectedCount', { count }) : pick)

  const productStatus = results.error ? (
    <span role="alert" className="flex flex-wrap items-center gap-2 text-destructive">
      {results.error.message}
      <Button type="button" variant="outline" className="h-10" onClick={() => void results.refetch()}>{t('scope.retry')}</Button>
    </span>
  ) : !settled || results.isPending ? (
    t('scope.loading')
  ) : results.data && results.data.total > found.length ? (
    t('scope.showingOf', { shown: found.length, total: results.data.total })
  ) : null

  return (
    <Field>
      <FieldLabel>{t('scope.title')}</FieldLabel>
      <p className="text-xs text-muted-foreground">{t('scope.hint')}</p>

      <div className="flex flex-col gap-2" role="group" aria-label={t('scope.categories')}>
        <p className="text-sm font-medium">{t('scope.categories')}</p>
        {categories.error && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            {categories.error.message}
            <Button type="button" variant="outline" className="h-10" onClick={() => void categories.refetch()}>{t('scope.retry')}</Button>
          </div>
        )}
        <MultiSelectCombobox
          label={countOr(value.categoryIds.length, t('scope.pickCategories'))}
          searchLabel={t('scope.searchCategories')}
          emptyText={categories.data?.length === 0 ? t('scope.noCategories') : t('scope.noMatches')}
          status={categories.isPending ? t('scope.loading') : null}
          items={(categories.data ?? []).map((category) => ({
            id: category.id,
            label: category.name,
            trailing: !category.isActive && <StatusBadge tone="neutral">{t('scope.inactive')}</StatusBadge>,
          }))}
          selectedIds={value.categoryIds}
          onToggle={toggleCategory}
        />
        {categories.data && categoryEntries.length > 0 && (
          <ul aria-label={t('scope.chosenCategories')} className="flex flex-wrap gap-2">
            {categoryEntries.map((entry) => {
              const label = entry.name ?? t('scope.missing', { id: entry.id })
              return (
                <li key={entry.id} className={cn('flex h-10 items-center gap-1 rounded-full border pl-3 text-sm', entry.status === 'missing' && 'border-warning text-warning')}>
                  {label}
                  {entry.status === 'inactive' && <StatusBadge tone="neutral">{t('scope.inactive')}</StatusBadge>}
                  <Button type="button" variant="ghost" className="size-10 rounded-full" aria-label={t('scope.remove', { name: label })} onClick={() => toggleCategory(entry.id)}>
                    <X />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2" role="group" aria-label={t('scope.products')}>
        <p className="text-sm font-medium">{t('scope.products')}</p>
        {failed.length > 0 && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            {failed[0]!.error!.message}
            <Button type="button" variant="outline" className="h-10" onClick={() => failed.forEach((result) => void result.refetch())}>{t('scope.retry')}</Button>
          </div>
        )}
        <MultiSelectCombobox
          label={countOr(value.productIds.length, t('scope.pickProducts'))}
          searchLabel={t('scope.search')}
          emptyText={t('scope.noResults')}
          status={productStatus}
          items={found.map((product) => ({
            id: product.id,
            label: product.name,
            hint: product.sku,
            leading: thumbnail(product.imageUrl),
            trailing: !product.isActive && <StatusBadge tone="neutral">{t('scope.inactive')}</StatusBadge>,
          }))}
          selectedIds={value.productIds}
          onToggle={toggleProduct}
          onSearchChange={setSearch}
        />
        {productEntries.length > 0 && (
          <ul aria-label={t('scope.chosen')} className="divide-y rounded-lg border">
            {productEntries.map((entry) => {
              const label = entry.name ?? (entry.status === 'loading' ? t('scope.loading') : t('scope.missing', { id: entry.id }))
              return (
                <li key={entry.id} className="flex min-h-12 items-center gap-2 pl-2 text-sm">
                  {thumbnail(knownProducts.get(entry.id)?.imageUrl)}
                  <span className={cn('min-w-0 flex-1 truncate', entry.status === 'missing' && 'text-warning')}>{label}</span>
                  {entry.status === 'inactive' && <StatusBadge tone="neutral">{t('scope.inactive')}</StatusBadge>}
                  <Button type="button" variant="ghost" className="size-10" aria-label={t('scope.remove', { name: label })} onClick={() => toggleProduct(entry.id)}>
                    <X />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Field>
  )
}
