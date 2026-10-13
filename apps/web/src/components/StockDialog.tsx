import type { Product } from '@pos/api/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, unwrap } from '@/lib/api'

export type StockMode = 'receive' | 'adjust'

const copy = {
  receive: { title: 'รับสินค้าเข้า', label: 'จำนวนที่รับเข้า (ชิ้น)', submit: 'รับเข้าสต็อก' },
  adjust: { title: 'ปรับยอดสต็อก', label: 'จำนวนที่นับได้จริง (ชิ้น)', submit: 'ปรับยอด' },
}

interface Props {
  product: Product
  mode: StockMode
  onClose: () => void
}

export function StockDialog({ product, mode, onClose }: Props) {
  const queryClient = useQueryClient()
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')

  const value = /^\d+$/.test(quantity.trim()) ? Number(quantity) : null
  const isValid = value !== null && (mode === 'receive' ? value >= 1 : value !== product.stockQty)
  const balanceAfter = value === null ? null : mode === 'receive' ? product.stockQty + value : value

  const save = useMutation({
    mutationFn: () => {
      const shared = { productId: product.id, note: note.trim() || undefined }
      return unwrap(
        mode === 'receive'
          ? api.inventory.receive.post({ ...shared, quantity: value! })
          : api.inventory.adjust.post({ ...shared, countedQty: value! }),
      )
    },
    onSuccess: (movement) => {
      toast.success(`"${product.name}" คงเหลือ ${movement.balanceAfter} ชิ้น`)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      onClose()
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (isValid) save.mutate()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy[mode].title}</DialogTitle>
          <DialogDescription>
            {product.name} · ในระบบมี {product.stockQty} ชิ้น
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stock-quantity">{copy[mode].label}</Label>
            <Input
              id="stock-quantity"
              className="h-12 text-right text-xl! tabular-nums"
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              autoFocus
              required
            />
            <p className="text-xs text-muted-foreground">
              {balanceAfter === null ? 'กรอกจำนวนเป็นตัวเลขเต็ม' : `หลังบันทึกจะคงเหลือ ${balanceAfter} ชิ้น`}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock-note">หมายเหตุ</Label>
            <Input
              id="stock-note"
              className="h-10"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={mode === 'receive' ? 'เช่น เลขที่ใบส่งของ' : 'เช่น นับสต็อกประจำเดือน ของชำรุด'}
              maxLength={500}
            />
          </div>

          {save.error && (
            <p role="alert" className="text-sm text-destructive">
              {save.error.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" className="h-10" disabled={!isValid || save.isPending}>
              {save.isPending ? 'กำลังบันทึก…' : copy[mode].submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
