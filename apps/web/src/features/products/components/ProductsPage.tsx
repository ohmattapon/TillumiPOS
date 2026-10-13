import type { Product } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, PackagePlus, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Panel, tableCell, tableHead } from '@/components/Panel'
import { ProductFormDialog } from './ProductFormDialog'
import { ProductImage } from './ProductImage'
import { SegmentedTabs } from '@/components/SegmentedTabs'
import { StatusBadge } from '@/components/StatusBadge'
import { StockDialog, type StockMode } from './StockDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { categoriesQuery } from '@/features/categories'
import { useFormat, useSettings } from '@/features/settings'
import { productsQuery, useSetProductActive } from '../api'
import { isLowStock } from '../lib/stock'

type Filter = 'all' | 'low' | 'inactive'

type OpenDialog = { kind: 'form'; product?: Product } | { kind: 'stock'; product: Product; mode: StockMode } | null

export function ProductsPage() {
  const { t } = useTranslation('products')
  const { t: tc } = useTranslation()
  const { money } = useFormat()
  const { vatMode } = useSettings()
  const products = useQuery(productsQuery(true))
  const categories = useQuery(categoriesQuery)

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<OpenDialog>(null)

  const setActive = useSetProductActive()
  const toggleActive = (product: Product) =>
    setActive.mutate(
      { id: product.id, isActive: !product.isActive },
      {
        onSuccess: (updated) =>
          toast.success(t(updated.isActive ? 'toast.activated' : 'toast.deactivated', { name: updated.name })),
        onError: (error) => toast.error(error.message),
      },
    )

  const all = products.data ?? []
  const categoryName = new Map(categories.data?.map((category) => [category.id, category.name]))
  const term = search.trim().toLowerCase()
  const visible = all.filter(
    (product) =>
      (filter === 'all' || (filter === 'low' ? product.isActive && isLowStock(product) : !product.isActive)) &&
      (term === '' ||
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        product.barcode?.includes(term)),
  )

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('pageDescription', {
          items: tc('items', { count: all.length }),
          priceNote: t(`priceNote.${vatMode}`),
        })}
      >
        <Button className="h-9 px-3" onClick={() => setDialog({ kind: 'form' })}>
          <Plus />
          {t('add')}
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedTabs
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('filters.all'), count: all.length },
              { value: 'low', label: t('filters.low'), count: all.filter((product) => product.isActive && isLowStock(product)).length },
              { value: 'inactive', label: t('filters.inactive'), count: all.filter((product) => !product.isActive).length },
            ]}
          />
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9"
              placeholder={t('search.placeholder')}
              aria-label={t('search.label')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <Panel title={t('list.title')} description={t('list.description', { shown: visible.length, total: all.length })}>
          {products.error && <p className="p-4 text-sm text-destructive">{products.error.message}</p>}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={tableHead}>{t('columns.product')}</TableHead>
                <TableHead className={tableHead}>{t('columns.category')}</TableHead>
                <TableHead className={tableHead}>{t('columns.barcode')}</TableHead>
                <TableHead className={`${tableHead} text-right`}>{t('columns.price')}</TableHead>
                <TableHead className={`${tableHead} text-right`}>{t('columns.cost')}</TableHead>
                <TableHead className={`${tableHead} text-right`}>{t('columns.stock')}</TableHead>
                <TableHead className={tableHead}>{t('columns.status')}</TableHead>
                <TableHead className={`${tableHead} w-0`}>
                  <span className="sr-only">{t('columns.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((product) => (
                <TableRow key={product.id} className={product.isActive ? '' : 'text-muted-foreground'}>
                  <TableCell className={tableCell}>
                    <div className="flex items-center gap-3">
                      <ProductImage src={product.imageUrl} alt="" className="size-10 rounded-md border" />
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.sku}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className={tableCell}>
                    {(product.categoryId && categoryName.get(product.categoryId)) || '—'}
                  </TableCell>
                  <TableCell className={`${tableCell} tabular-nums`}>{product.barcode ?? '—'}</TableCell>
                  <TableCell className={`${tableCell} text-right tabular-nums`}>{money.plain(product.priceSatang)}</TableCell>
                  <TableCell className={`${tableCell} text-right tabular-nums`}>{money.plain(product.costSatang)}</TableCell>
                  <TableCell className={`${tableCell} text-right font-medium tabular-nums`}>
                    {product.trackStock ? product.stockQty : '—'}
                  </TableCell>
                  <TableCell className={tableCell}>
                    {!product.isActive ? (
                      <StatusBadge tone="neutral">{t('status.inactive')}</StatusBadge>
                    ) : !product.trackStock ? (
                      <StatusBadge tone="neutral">{t('status.untracked')}</StatusBadge>
                    ) : product.stockQty <= 0 ? (
                      <StatusBadge tone="danger">{t('status.out')}</StatusBadge>
                    ) : isLowStock(product) ? (
                      <StatusBadge tone="warning">{t('status.low')}</StatusBadge>
                    ) : (
                      <StatusBadge tone="success">{t('status.ready')}</StatusBadge>
                    )}
                  </TableCell>
                  <TableCell className={`${tableCell} text-right whitespace-nowrap`}>
                    {product.trackStock && (
                      <Button
                        variant="outline"
                        className="mr-2 h-9"
                        onClick={() => setDialog({ kind: 'stock', product, mode: 'receive' })}
                      >
                        <PackagePlus />
                        {t('actions.receive')}
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="size-9" aria-label={t('actions.more', { name: product.name })}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDialog({ kind: 'form', product })}>
                          {t('actions.edit')}
                        </DropdownMenuItem>
                        {product.trackStock && (
                          <DropdownMenuItem onSelect={() => setDialog({ kind: 'stock', product, mode: 'adjust' })}>
                            {t('actions.adjust')}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => toggleActive(product)}>
                          {product.isActive ? t('actions.deactivate') : t('actions.activate')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {!products.isPending && visible.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    {t('list.empty')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Panel>
      </div>

      {dialog?.kind === 'form' && (
        <ProductFormDialog product={dialog.product} categories={categories.data ?? []} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'stock' && (
        <StockDialog product={dialog.product} mode={dialog.mode} onClose={() => setDialog(null)} />
      )}
    </>
  )
}
