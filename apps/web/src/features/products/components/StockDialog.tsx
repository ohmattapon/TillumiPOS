import type { Product } from '@pos/api/types'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useChangeStock, type StockChange } from '../api'

export type StockMode = 'receive' | 'adjust'

interface Props {
  product: Product
  mode: StockMode
  onClose: () => void
}

export function StockDialog({ product, mode, onClose }: Props) {
  const { t } = useTranslation('products')
  const { t: tc } = useTranslation()
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')

  const value = /^\d+$/.test(quantity.trim()) ? Number(quantity) : null
  const isValid = value !== null && (mode === 'receive' ? value >= 1 : value !== product.stockQty)
  const balanceAfter = value === null ? null : mode === 'receive' ? product.stockQty + value : value

  const save = useChangeStock()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!isValid || value === null) return
    const trimmedNote = note.trim() || undefined
    const change: StockChange =
      mode === 'receive'
        ? { mode, productId: product.id, quantity: value, note: trimmedNote }
        : { mode, productId: product.id, countedQty: value, note: trimmedNote }
    save.mutate(change, {
      onSuccess: (movement) => {
        toast.success(t('toast.stockNow', { name: product.name, count: movement.balanceAfter }))
        onClose()
      },
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t(`stock.${mode}Title`)}</DialogTitle>
          <DialogDescription>
            {t('stock.current', { name: product.name, count: product.stockQty })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stock-quantity">{t(`stock.${mode}Label`)}</Label>
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
              {balanceAfter === null ? t('stock.enterWhole') : t('stock.after', { count: balanceAfter })}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock-note">{t('stock.note')}</Label>
            <Input
              id="stock-note"
              className="h-10"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t(`stock.${mode}Note`)}
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
              {tc('cancel')}
            </Button>
            <Button type="submit" className="h-10" disabled={!isValid || save.isPending}>
              {save.isPending ? t('stock.saving') : t(`stock.${mode}Submit`)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
