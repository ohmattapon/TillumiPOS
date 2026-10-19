import type { RefObject } from 'react'
import { useState } from 'react'
import { LoaderCircle, Printer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/features/settings'
import { newIdempotencyKey } from '@/lib/idempotency-key'
import { useLanPrint } from '../api'
import { canPrintOverLan } from '../lib/lan-print'
import { rasterizeReceipt } from '../lib/rasterize-receipt'

interface Props {
  saleId: number
  receiptRef: RefObject<HTMLDivElement | null>
  disabled?: boolean
}

export function LanPrintButton({ saleId, receiptRef, disabled = false }: Props) {
  const { t } = useTranslation('sales')
  const shop = useSettings()
  const print = useLanPrint(saleId)
  // One key per print the person means to send once: a retry after a failure keeps it,
  // a reprint after success gets a new one.
  const [key, setKey] = useState(() => newIdempotencyKey())
  const [isWorking, setIsWorking] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // The PDF button stays the way to print until the shop sets the printer up.
  if (!canPrintOverLan(shop)) return null

  const send = async () => {
    const element = receiptRef.current
    if (!element || isWorking) return

    setIsWorking(true)
    setFailure(null)
    try {
      const bitmap = await rasterizeReceipt(element, shop.receiptPaperMm)
      await print.mutateAsync({ bitmap, key })
      toast.success(t('receipt.lanPrinted'))
      setKey(newIdempotencyKey())
    } catch (error) {
      // Never show a print as done before the server answers: paper and ink cannot be undone.
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <div className="flex-1 space-y-1">
      <Button
        type="button"
        variant="outline"
        className="h-10 w-full"
        disabled={disabled || isWorking}
        onClick={() => void send()}
      >
        {isWorking ? <LoaderCircle className="animate-spin" /> : <Printer />}
        {isWorking ? t('receipt.lanPrinting') : t('receipt.lanPrint')}
      </Button>
      {failure && (
        <p role="alert" className="text-xs text-destructive">
          {t('receipt.lanFailed', { reason: failure })} {t('receipt.lanFallbackHint')}
        </p>
      )}
    </div>
  )
}
