import { QRCodeSVG } from 'qrcode.react'
import type { DisplayQr } from '../lib/display-state'

/** The QR the customer scans: the bank's own picture, or a static PromptPay payload drawn here. */
export function ScanQr({ qr, alt }: { qr: DisplayQr; alt: string }) {
  if ('payload' in qr)
    return (
      <div role="img" aria-label={alt} className="aspect-square w-full max-w-[44vh] rounded-xl bg-white p-[1.5vh]">
        <QRCodeSVG value={qr.payload} size={512} marginSize={0} className="size-full" />
      </div>
    )
  return (
    <img
      src={`data:image/png;base64,${qr.image}`}
      alt={alt}
      className="aspect-square max-h-[48vh] min-h-0 rounded-xl bg-white p-[1.5vh]"
    />
  )
}
