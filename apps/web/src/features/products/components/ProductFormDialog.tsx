import type { Category, Product } from '@pos/api/types'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ProductImage } from './ProductImage'
import { useFormat, useSettings } from '@/features/settings'
import { useSaveProduct } from '../api'

// Radix Select cannot use an empty string as an item value.
const NO_CATEGORY = 'none'

interface Props {
  /** Omit to create a new product. */
  product?: Product
  categories: Category[]
  onClose: () => void
}

export function ProductFormDialog({ product, categories, onClose }: Props) {
  const { t } = useTranslation('products')
  const { t: tc } = useTranslation()
  const { money, currency } = useFormat()
  const { vatMode } = useSettings()
  const [form, setForm] = useState({
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    name: product?.name ?? '',
    categoryId: product?.categoryId ? String(product.categoryId) : NO_CATEGORY,
    price: product ? money.toInput(product.priceSatang) : '',
    cost: product ? money.toInput(product.costSatang) : '',
    trackStock: product?.trackStock ?? true,
  })
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm({ ...form, [key]: value })

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

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (priceSatang === null || costSatang === null) return
    save.mutate(
      {
        id: product?.id,
        image,
        input: {
          sku: form.sku.trim(),
          name: form.name.trim(),
          barcode: form.barcode.trim() || null,
          categoryId: form.categoryId === NO_CATEGORY ? null : Number(form.categoryId),
          priceSatang,
          costSatang,
          trackStock: form.trackStock,
        },
      },
      {
        onSuccess: (saved) => {
          toast.success(t(product ? 'toast.updated' : 'toast.created', { name: saved.name }))
          onClose()
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? t('form.titleEdit') : t('form.titleNew')}</DialogTitle>
          <DialogDescription>{t('form.description', { priceNote: t(`form.priceNote.${vatMode}`) })}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid grid-cols-2 gap-4">
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
          <div className="col-span-2 space-y-2">
            <Label htmlFor="product-name">{t('form.name')}</Label>
            <Input id="product-name" className="h-10" value={form.name} onChange={(event) => set('name', event.target.value)} required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-sku">{t('form.sku')}</Label>
            <Input id="product-sku" className="h-10" value={form.sku} onChange={(event) => set('sku', event.target.value)} required />
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
          <label className="col-span-2 flex items-center justify-between gap-4 rounded-lg border p-3">
            <span>
              <span className="block text-sm font-medium">{t('form.trackStock')}</span>
              <span className="block text-xs text-muted-foreground">{t('form.trackStockHint')}</span>
            </span>
            <Switch checked={form.trackStock} onCheckedChange={(checked) => set('trackStock', checked)} />
          </label>

          {save.error && (
            <p role="alert" className="col-span-2 text-sm text-destructive">
              {save.error.message}
            </p>
          )}

          <DialogFooter className="col-span-2">
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
