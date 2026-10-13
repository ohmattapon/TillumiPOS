import type { Sale } from '@pos/api/types'
import { formatBaht, formatDateTime, paymentMethodLabel } from '@/lib/money'

/** Receipt body. Shown inside a dialog on screen and printed on its own (see the print rules in index.css). */
export function Receipt({ sale }: { sale: Sale }) {
  const row = 'flex justify-between gap-4'

  return (
    <div className="space-y-2 font-mono text-sm tabular-nums">
      <div className="text-center">
        <p className="text-base font-bold">ใบเสร็จรับเงิน</p>
        <p>เลขที่ {sale.receiptNo}</p>
        <p>{formatDateTime(sale.createdAt)}</p>
        <p>พนักงาน: {sale.cashierName}</p>
        {sale.status === 'voided' && <p className="font-bold">*** ยกเลิกแล้ว: {sale.voidReason} ***</p>}
      </div>
      <hr className="border-dashed border-foreground/40" />
      {sale.items.map((item) => (
        <div key={item.productId}>
          <p>{item.productName}</p>
          <p className={row}>
            <span>
              {item.quantity} x {formatBaht(item.unitPriceSatang)}
            </span>
            <span>{formatBaht(item.lineTotalSatang)}</span>
          </p>
        </div>
      ))}
      <hr className="border-dashed border-foreground/40" />
      <p className={row}>
        <span>รวม</span>
        <span>{formatBaht(sale.subtotalSatang)}</span>
      </p>
      {sale.discountSatang > 0 && (
        <p className={row}>
          <span>ส่วนลด</span>
          <span>-{formatBaht(sale.discountSatang)}</span>
        </p>
      )}
      <p className={`${row} text-base font-bold`}>
        <span>ยอดสุทธิ</span>
        <span>{formatBaht(sale.totalSatang)}</span>
      </p>
      <p className={row}>
        <span>VAT ที่รวมอยู่</span>
        <span>{formatBaht(sale.vatSatang)}</span>
      </p>
      {sale.payments.map((payment, index) => (
        <p key={index} className={row}>
          <span>{paymentMethodLabel[payment.method]}</span>
          <span>{formatBaht(payment.amountSatang)}</span>
        </p>
      ))}
      <p className={row}>
        <span>เงินทอน</span>
        <span>{formatBaht(sale.changeSatang)}</span>
      </p>
    </div>
  )
}
