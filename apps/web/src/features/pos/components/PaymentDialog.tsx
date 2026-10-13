import { Banknote, CreditCard, QrCode, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatBaht, parseBaht, paymentMethodLabel, type PaymentMethod } from '@/lib/money'
import { cn } from '@/lib/utils'

const methods: { value: PaymentMethod; icon: LucideIcon }[] = [
  { value: 'cash', icon: Banknote },
  { value: 'promptpay', icon: QrCode },
  { value: 'card', icon: CreditCard },
]

const quickCash = [2000, 5000, 10000, 50000, 100000]

interface Props {
  totalSatang: number
  isSubmitting: boolean
  error?: string
  onConfirm: (payment: { method: PaymentMethod; amountSatang: number }) => void
  onCancel: () => void
}

export function PaymentDialog({ totalSatang, isSubmitting, error, onConfirm, onCancel }: Props) {
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [received, setReceived] = useState('')

  // Non-cash methods always pay the exact total; only cash can be over-tendered.
  const amountSatang = method === 'cash' ? parseBaht(received) : totalSatang
  const changeSatang = amountSatang === null ? null : amountSatang - totalSatang
  const canConfirm = changeSatang !== null && changeSatang >= 0 && !isSubmitting

  return (
    <Dialog open onOpenChange={(open) => !open && !isSubmitting && onCancel()}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="items-center text-center">
          <DialogDescription>ยอดที่ต้องชำระ</DialogDescription>
          <DialogTitle className="text-4xl font-semibold tabular-nums">฿{formatBaht(totalSatang)}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (canConfirm && amountSatang !== null) onConfirm({ method, amountSatang })
          }}
        >
          <div className="grid grid-cols-3 gap-2">
            {methods.map(({ value, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={method === value}
                onClick={() => setMethod(value)}
                className={cn(
                  'flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  method === value ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted',
                )}
              >
                <Icon className="size-5" />
                {paymentMethodLabel[value]}
              </button>
            ))}
          </div>

          {method === 'cash' && (
            <>
              <Input
                className="h-14 text-right text-2xl! tabular-nums"
                inputMode="decimal"
                placeholder="รับเงินมา (บาท)"
                aria-label="จำนวนเงินที่รับมา (บาท)"
                value={received}
                onChange={(event) => setReceived(event.target.value)}
                autoFocus
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setReceived(String(totalSatang / 100))}>
                  พอดี
                </Button>
                {quickCash
                  .filter((satang) => satang >= totalSatang)
                  .map((satang) => (
                    <Button
                      key={satang}
                      type="button"
                      variant="outline"
                      className="h-11 px-4 tabular-nums"
                      onClick={() => setReceived(String(satang / 100))}
                    >
                      {satang / 100}
                    </Button>
                  ))}
              </div>
              <p className="flex items-baseline justify-between rounded-lg bg-muted px-4 py-3">
                <span className="text-muted-foreground">เงินทอน</span>
                <span className="text-2xl font-semibold tabular-nums">
                  {changeSatang !== null && changeSatang >= 0 ? `฿${formatBaht(changeSatang)}` : '—'}
                </span>
              </p>
            </>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-12 text-base" disabled={isSubmitting} onClick={onCancel}>
              ยกเลิก
            </Button>
            <Button type="submit" className="h-12 text-base" disabled={!canConfirm}>
              {isSubmitting ? 'กำลังบันทึก…' : 'ยืนยันการชำระ'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
