import type { Sale } from '@pos/api/types'
import { useTranslation } from 'react-i18next'
import { useFormat, useSettings } from '@/features/settings'

/** Receipt body. Shown inside a dialog on screen and printed on its own (see the print rules in index.css). */
export function Receipt({ sale }: { sale: Sale }) {
  const { t } = useTranslation('sales')
  const { t: tc } = useTranslation()
  const { money, date } = useFormat()
  const { shopName, taxId, address, phone } = useSettings()
  const row = 'flex justify-between gap-4'

  // The tax rules the sale was rung up under, not today's settings: changing them never rewrites old bills.
  const vatRate = String(sale.vatRateBp / 100)
  const vatAdded = sale.vatMode === 'exclusive'
  const vatIncluded = sale.vatMode === 'inclusive'

  return (
    <div className="space-y-2 font-mono text-sm tabular-nums">
      <div className="text-center">
        <p className="text-base font-bold">{shopName}</p>
        {address && <p>{address}</p>}
        {phone && <p>{t('receipt.phone', { phone })}</p>}
        {taxId && <p>{t('receipt.taxId', { taxId })}</p>}
        <p className="pt-2 font-bold">{t('receipt.title')}</p>
        <p>{t('receipt.number', { receiptNo: sale.receiptNo })}</p>
        <p>{date.dateTime(sale.createdAt)}</p>
        <p>{t('receipt.cashier', { name: sale.cashierName })}</p>
        {sale.status === 'voided' && <p className="font-bold">{t('receipt.voided', { reason: sale.voidReason })}</p>}
      </div>
      <hr className="border-dashed border-foreground/40" />
      {sale.items.map((item) => (
        <div key={item.productId}>
          <p>{item.productName}</p>
          <p className={row}>
            <span>{t('receipt.item', { quantity: item.quantity, price: money.plain(item.unitPriceSatang) })}</span>
            <span>{money.plain(item.lineTotalSatang)}</span>
          </p>
        </div>
      ))}
      <hr className="border-dashed border-foreground/40" />
      <p className={row}>
        <span>{vatAdded ? t('receipt.subtotalBeforeVat') : t('receipt.subtotal')}</span>
        <span>{money.plain(sale.subtotalSatang)}</span>
      </p>
      {sale.discountSatang > 0 && (
        <p className={row}>
          <span>{t('receipt.discount')}</span>
          <span>-{money.plain(sale.discountSatang)}</span>
        </p>
      )}
      {vatAdded && (
        <p className={row}>
          <span>{t('receipt.vatAdded', { rate: vatRate })}</span>
          <span>{money.plain(sale.vatSatang)}</span>
        </p>
      )}
      <p className={`${row} text-base font-bold`}>
        <span>{t('receipt.total')}</span>
        <span>{money.format(sale.totalSatang)}</span>
      </p>
      {vatIncluded && (
        <p className={row}>
          <span>{t('receipt.vatIncluded', { rate: vatRate })}</span>
          <span>{money.plain(sale.vatSatang)}</span>
        </p>
      )}
      {sale.payments.map((payment, index) => (
        <p key={index} className={row}>
          <span>{tc(`paymentMethods.${payment.method}`)}</span>
          <span>{money.plain(payment.amountSatang)}</span>
        </p>
      ))}
      <p className={row}>
        <span>{t('receipt.change')}</span>
        <span>{money.plain(sale.changeSatang)}</span>
      </p>
    </div>
  )
}
