import type { RefObject } from 'react'
import { useState } from 'react'
import { Download, LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/features/settings'
import { downloadReceiptPdf } from '../lib/download-receipt-pdf'

interface Props {
  receiptNo: string
  receiptRef: RefObject<HTMLDivElement | null>
  className?: string
  disabled?: boolean
}

export function ReceiptPdfButton({ receiptNo, receiptRef, className, disabled = false }: Props) {
  const { t } = useTranslation('sales')
  const shop = useSettings()
  const [isSaving, setIsSaving] = useState(false)

  const savePdf = async () => {
    const element = receiptRef.current
    if (!element || isSaving) return

    setIsSaving(true)
    try {
      const safeReceiptNo = receiptNo.replace(/[<>:"/\\|?*]/g, '-').trim()
      await downloadReceiptPdf(element, `receipt-${safeReceiptNo || 'sale'}.pdf`, shop.receiptPaperMm)
      toast.success(t('receipt.pdfSaved'))
    } catch {
      toast.error(t('receipt.pdfFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      disabled={disabled || isSaving}
      onClick={() => void savePdf()}
    >
      {isSaving ? <LoaderCircle className="animate-spin" /> : <Download />}
      {isSaving ? t('receipt.pdfSaving') : t('receipt.downloadPdf')}
    </Button>
  )
}
