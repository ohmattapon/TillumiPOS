import type { Category, Product } from '@pos/api/types'
import { packUnitPriceSatang } from '@pos/api/packs'
import { useQuery } from '@tanstack/react-query'
import { ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldLabel } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { ProductImage } from './ProductImage'
import { modifierGroupsQuery } from '@/features/modifiers'
import { useCan } from '@/features/auth'
import { useFeatures, useFormat, useSettings } from '@/features/settings'
import { imageStorageQuery } from '@/features/settings'
import { productsQuery, useSaveProduct } from '../api'
import { CAFE_SKU_PREFIX, CAFE_SKU_SCAN_LIMIT, nextCafeSku } from '../lib/cafe-sku'
import { MAX_PACKS, toPackInput, toPackRows, type PackRow } from '../lib/packs'

// Radix Select cannot use an empty string as an item value.
const NO_CATEGORY = 'none'

interface Props {
  /** Omit to create a new product. */
  product?: Product
  initialType?: Product['productType']
  categories: Category[]
  onSaved: (product: Product) => void
  onClose: () => void
}

export function ProductFormDialog({ product, initialType = 'normal', categories, onSaved, onClose }: Props) {
  const { modifiers: showModifiers } = useFeatures()
  const canEditModifiers = useCan('modifiers.write') && showModifiers
  const { t } = useTranslation('products')
  const { t: tc } = useTranslation()
  const { money, currency } = useFormat()
  const { vatMode } = useSettings()
  const [form, setForm] = useState({
    productType: product?.productType ?? initialType,
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    name: product?.name ?? '',
    categoryId: product?.categoryId ? String(product.categoryId) : NO_CATEGORY,
    price: product ? money.toInput(product.priceSatang) : '',
    cost: product ? money.toInput(product.costSatang) : '',
    trackStock: product?.trackStock ?? true,
  })
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm({ ...form, [key]: value })

  // The packs this product is sold in; each row is typed as text until the form is saved.
  const [packs, setPacks] = useState<PackRow[]>(() => toPackRows(product?.packs ?? [], money.toInput))
  const [packError, setPackError] = useState<{ error: 'size' | 'price'; index: number } | null>(null)
  const setPack = (index: number, patch: Partial<PackRow>) =>
    setPacks((current) => current.map((row, position) => (position === index ? { ...row, ...patch } : row)))

  // A café product added from the café button starts on the next free CAFE-### code,
  // which the owner may still overwrite; the server's unique SKU stays the authority.
  const creatingCafe = product === undefined && initialType === 'cafe'
  const cafeSkuFilters = { q: CAFE_SKU_PREFIX, includeInactive: true, limit: CAFE_SKU_SCAN_LIMIT }
  const cafeProducts = useQuery({ ...productsQuery(cafeSkuFilters), enabled: creatingCafe })
  const nextSku = cafeProducts.data ? nextCafeSku(cafeProducts.data.items.map((item) => item.sku)) : null
  const skuPrefilled = useRef(false)
  useEffect(() => {
    if (!creatingCafe || !nextSku || skuPrefilled.current) return
    skuPrefilled.current = true
    // Fill only the untouched, empty field so nothing the owner typed is overwritten.
    setForm((current) => (current.sku === '' ? { ...current, sku: nextSku } : current))
  }, [creatingCafe, nextSku])

  const groups = useQuery(modifierGroupsQuery).data ?? []
  // The groups already offered on this product; until the owner touches them, what is stored.
  const [groupIds, setGroupIds] = useState<number[] | null>(null)
  const chosenGroupIds =
    groupIds ?? (product ? groups.filter((group) => group.productIds.includes(product.id)).map((group) => group.id) : [])
  const toggleGroup = (id: number) =>
    setGroupIds(chosenGroupIds.includes(id) ? chosenGroupIds.filter((value) => value !== id) : [...chosenGroupIds, id])

  // undefined = keep the current image, null = remove it, File = replace it.
  const [image, setImage] = useState<File | null | undefined>(undefined)
  const [preview, setPreview] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const chooseImage = (file: File | null) => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(file ? URL.createObjectURL(file) : null)
    setImage(file)
  }
  // Release the last preview when the dialog goes away.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  const shownImage = image === undefined ? (product?.imageUrl ?? null) : preview

  const priceSatang = money.parse(form.price)
  const costSatang = form.cost.trim() === '' ? 0 : money.parse(form.cost)

  const save = useSaveProduct()
  // Without an image store the upload is not offered: it would only fail.
  const imageStorage = useQuery(imageStorageQuery).data

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (priceSatang === null || costSatang === null) return
    const packInput = toPackInput(packs, money.parse)
    if ('error' in packInput) {
      setPackError(packInput)
      return
    }
    setPackError(null)
    save.mutate(
      {
        id: product?.id,
        image,
        // Only sent once the list has loaded, so a slow request never clears what a product offers.
        modifierGroupIds: canEditModifiers && groups.length > 0 ? chosenGroupIds : undefined,
        input: {
          productType: form.productType,
          sku: product ? form.sku.trim() : form.sku.trim() || undefined,
          name: form.name.trim(),
          barcode: form.barcode.trim() || null,
          categoryId: form.categoryId === NO_CATEGORY ? null : Number(form.categoryId),
          priceSatang,
          costSatang,
          trackStock: form.trackStock,
          // A stored product always sends the list so removing a pack applies; a new one with none sends nothing.
          packs: product || packInput.packs.length > 0 ? packInput.packs : undefined,
        },
      },
      {
        onSuccess: (saved) => {
          toast.success(t(product ? 'toast.updated' : 'toast.created', { name: saved.name }))
          onSaved(saved)
          onClose()
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? t('form.titleEdit') : t('form.titleNew')}</DialogTitle>
          <DialogDescription>{t('form.description', { priceNote: t(`form.priceNote.${vatMode}`) })}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Only the fields scroll, so the confirm row stays at the bottom of the dialog. */}
          <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 grid grid-cols-2 gap-4">
            {imageStorage !== 'disabled' && (
              <div className="col-span-2 flex items-center gap-4">
                <ProductImage src={shownImage} alt={t('form.imageAlt')} className="size-20 rounded-lg border" />
                <div className="space-y-2">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    aria-label={t('form.imageInput')}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) chooseImage(file)
                      event.target.value = ''
                    }}
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="h-9" onClick={() => fileInput.current?.click()}>
                      <ImagePlus />
                      {shownImage ? t('form.changeImage') : t('form.pickImage')}
                    </Button>
                    {shownImage && (
                      <Button type="button" variant="ghost" className="h-9 text-muted-foreground" onClick={() => chooseImage(null)}>
                        <Trash2 />
                        {t('form.removeImage')}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{t('form.imageHint')}</p>
                </div>
              </div>
            )}
            <div className="col-span-2 space-y-2">
              <Label htmlFor="product-name">{t('form.name')}</Label>
              <Input id="product-name" className="h-10" value={form.name} onChange={(event) => set('name', event.target.value)} required autoFocus />
            </div>
            <Field className="col-span-2">
              <FieldLabel htmlFor="product-type">{t('form.productType')}</FieldLabel>
              <Select value={form.productType} onValueChange={(value) => {
                if (value === 'normal' || value === 'cafe') set('productType', value)
              }}>
                <SelectTrigger id="product-type" className="h-11! w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="normal" className="min-h-11">{t('types.normal')}</SelectItem>
                    <SelectItem value="cafe" className="min-h-11">{t('types.cafe')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <div className="space-y-2">
              <Label htmlFor="product-sku">{t('form.sku')}</Label>
              <Input id="product-sku" className="h-11" value={form.sku} onChange={(event) => set('sku', event.target.value)} required={!!product} maxLength={64} placeholder={product ? undefined : t('form.skuAuto')} aria-describedby={product ? undefined : 'product-sku-hint'} />
              {!product && <p id="product-sku-hint" className="text-xs text-muted-foreground">{t(creatingCafe ? 'form.cafeSkuAuto' : 'form.skuAutoHint')}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-barcode">{t('form.barcode')}</Label>
              <Input id="product-barcode" className="h-10" value={form.barcode} onChange={(event) => set('barcode', event.target.value)} placeholder={t('form.optional')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-price">{t('form.price', { currency })}</Label>
              <Input
                id="product-price"
                className="h-10 text-right tabular-nums"
                inputMode="decimal"
                aria-invalid={form.price !== '' && priceSatang === null}
                value={form.price}
                onChange={(event) => set('price', event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-cost">{t('form.cost', { currency })}</Label>
              <Input
                id="product-cost"
                className="h-10 text-right tabular-nums"
                inputMode="decimal"
                aria-invalid={costSatang === null}
                value={form.cost}
                onChange={(event) => set('cost', event.target.value)}
                placeholder={money.plain(0)}
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="product-category">{t('form.category')}</Label>
              <Select value={form.categoryId} onValueChange={(value) => set('categoryId', value)}>
                <SelectTrigger id="product-category" className="h-10! w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>{t('form.noCategory')}</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <fieldset className="col-span-2 space-y-3 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">{t('form.packs')}</legend>
              <p className="text-xs text-muted-foreground">{t('form.packsHint')}</p>
              {packs.map((row, index) => {
                const size = /^\d+$/.test(row.size.trim()) ? Number(row.size) : null
                const autoPrice =
                  priceSatang !== null && size !== null && size > 0
                    ? money.plain(packUnitPriceSatang(priceSatang, { size, priceSatang: null }))
                    : ''
                const rowError = packError?.index === index ? packError.error : null
                return (
                  <div key={row.id ?? `new-${index}`} className="space-y-2">
                    <div className="grid grid-cols-[1fr_5rem] gap-2 sm:grid-cols-[1fr_5rem_8rem]">
                      <Input
                        className="h-10"
                        aria-label={t('form.packBarcode')}
                        placeholder={t('form.packBarcode')}
                        maxLength={64}
                        value={row.barcode}
                        onChange={(event) => setPack(index, { barcode: event.target.value })}
                      />
                      <Input
                        className="h-10 text-right tabular-nums"
                        inputMode="numeric"
                        aria-label={t('form.packSize')}
                        placeholder={t('form.packSize')}
                        aria-invalid={rowError === 'size'}
                        value={row.size}
                        onChange={(event) => setPack(index, { size: event.target.value })}
                      />
                      <Input
                        className="col-span-2 h-10 text-right tabular-nums sm:col-span-1"
                        inputMode="decimal"
                        aria-label={t('form.packPrice', { currency })}
                        placeholder={
                          autoPrice ? t('form.packAutoPrice', { price: autoPrice }) : t('form.packPrice', { currency })
                        }
                        aria-invalid={rowError === 'price'}
                        value={row.price}
                        onChange={(event) => setPack(index, { price: event.target.value })}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex min-h-10 items-center gap-2 text-sm">
                        <Switch checked={row.isActive} onCheckedChange={(checked) => setPack(index, { isActive: checked })} />
                        {t('form.packActive')}
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-10 text-muted-foreground"
                        aria-label={t('form.removePack')}
                        onClick={() => setPacks((current) => current.filter((_, position) => position !== index))}
                      >
                        <X />
                      </Button>
                    </div>
                    {rowError && (
                      <p role="alert" className="text-sm text-destructive">
                        {t(rowError === 'size' ? 'form.packSizeInvalid' : 'form.packPriceInvalid')}
                      </p>
                    )}
                  </div>
                )
              })}
              <Button
                type="button"
                variant="outline"
                className="h-10"
                disabled={packs.length >= MAX_PACKS}
                onClick={() => setPacks([...packs, { barcode: '', size: '', price: '', isActive: true }])}
              >
                <Plus />
                {t('form.addPack')}
              </Button>
            </fieldset>

            <label className="col-span-2 flex items-center justify-between gap-4 rounded-lg border p-3">
              <span>
                <span className="block text-sm font-medium">{t('form.trackStock')}</span>
                <span className="block text-xs text-muted-foreground">{t('form.trackStockHint')}</span>
              </span>
              <Switch checked={form.trackStock} onCheckedChange={(checked) => set('trackStock', checked)} />
            </label>

            {showModifiers && groups.length > 0 && (
              <fieldset className="col-span-2 space-y-2 rounded-lg border p-3">
                <legend className="px-1 text-sm font-medium">{t('form.modifiers')}</legend>
                <p className="text-xs text-muted-foreground">{t('form.modifiersHint')}</p>
                <div className="flex flex-wrap gap-2">
                  {groups
                    .filter((group) => group.isActive || chosenGroupIds.includes(group.id))
                    .map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        role="checkbox"
                        aria-checked={chosenGroupIds.includes(group.id)}
                        onClick={() => toggleGroup(group.id)}
                        className="rounded-full border px-3 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-primary aria-checked:bg-primary/10 aria-checked:text-primary"
                      >
                        {group.name}
                      </button>
                    ))}
                </div>
              </fieldset>
            )}

            {save.error && (
              <p role="alert" className="col-span-2 text-sm text-destructive">
                {save.error.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" className="h-10" disabled={save.isPending || priceSatang === null || costSatang === null}>
              {save.isPending ? t('form.saving') : t('form.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
