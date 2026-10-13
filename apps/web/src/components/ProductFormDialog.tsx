import type { Category, Product } from '@pos/api/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ProductImage } from './ProductImage'
import { api, unwrap } from '@/lib/api'
import { prepareImage } from '@/lib/image'
import { parseBaht } from '@/lib/money'

// Radix Select cannot use an empty string as an item value.
const NO_CATEGORY = 'none'

interface Props {
  /** Omit to create a new product. */
  product?: Product
  categories: Category[]
  onClose: () => void
}

export function ProductFormDialog({ product, categories, onClose }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    name: product?.name ?? '',
    categoryId: product?.categoryId ? String(product.categoryId) : NO_CATEGORY,
    price: product ? String(product.priceSatang / 100) : '',
    cost: product ? String(product.costSatang / 100) : '',
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

  const priceSatang = parseBaht(form.price)
  const costSatang = form.cost.trim() === '' ? 0 : parseBaht(form.cost)

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        barcode: form.barcode.trim() || null,
        categoryId: form.categoryId === NO_CATEGORY ? null : Number(form.categoryId),
        priceSatang: priceSatang!,
        costSatang: costSatang!,
        trackStock: form.trackStock,
      }
      const saved = await unwrap(
        product ? api.catalog.products({ id: product.id }).patch(body) : api.catalog.products.post(body),
      )
      // The image endpoints need the product id, so they run after the product itself is saved.
      if (image) return unwrap(api.catalog.products({ id: saved.id }).image.put({ file: await prepareImage(image) }))
      if (image === null && saved.imageUrl) return unwrap(api.catalog.products({ id: saved.id }).image.delete())
      return saved
    },
    // Even when the image step fails the product was saved, so the list must refresh either way.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
    onSuccess: (saved) => {
      toast.success(product ? `บันทึก "${saved.name}" แล้ว` : `เพิ่ม "${saved.name}" แล้ว`)
      onClose()
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (priceSatang !== null && costSatang !== null) save.mutate()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}</DialogTitle>
          <DialogDescription>ราคาขายเป็นราคารวม VAT · จำนวนสต็อกแก้ที่ปุ่มรับเข้าหรือปรับยอด</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2 flex items-center gap-4">
            <ProductImage src={shownImage} alt="รูปสินค้า" className="size-20 rounded-lg border" />
            <div className="space-y-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label="เลือกรูปสินค้า"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) chooseImage(file)
                  event.target.value = ''
                }}
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="h-9" onClick={() => fileInput.current?.click()}>
                  <ImagePlus />
                  {shownImage ? 'เปลี่ยนรูป' : 'เลือกรูป'}
                </Button>
                {shownImage && (
                  <Button type="button" variant="ghost" className="h-9 text-muted-foreground" onClick={() => chooseImage(null)}>
                    <Trash2 />
                    ลบรูป
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">JPEG, PNG หรือ WebP · ระบบย่อรูปให้อัตโนมัติ</p>
            </div>
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="product-name">ชื่อสินค้า</Label>
            <Input id="product-name" className="h-10" value={form.name} onChange={(event) => set('name', event.target.value)} required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-sku">รหัสสินค้า (SKU)</Label>
            <Input id="product-sku" className="h-10" value={form.sku} onChange={(event) => set('sku', event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-barcode">บาร์โค้ด</Label>
            <Input id="product-barcode" className="h-10" value={form.barcode} onChange={(event) => set('barcode', event.target.value)} placeholder="ไม่บังคับ" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-price">ราคาขาย (บาท)</Label>
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
            <Label htmlFor="product-cost">ต้นทุน (บาท)</Label>
            <Input
              id="product-cost"
              className="h-10 text-right tabular-nums"
              inputMode="decimal"
              aria-invalid={costSatang === null}
              value={form.cost}
              onChange={(event) => set('cost', event.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="product-category">หมวดหมู่</Label>
            <Select value={form.categoryId} onValueChange={(value) => set('categoryId', value)}>
              <SelectTrigger id="product-category" className="h-10! w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>ไม่ระบุ</SelectItem>
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
              <span className="block text-sm font-medium">นับสต็อก</span>
              <span className="block text-xs text-muted-foreground">ปิดสำหรับสินค้าที่ไม่ต้องนับจำนวน เช่น ค่าบริการ</span>
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
              ยกเลิก
            </Button>
            <Button type="submit" className="h-10" disabled={save.isPending || priceSatang === null || costSatang === null}>
              {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
