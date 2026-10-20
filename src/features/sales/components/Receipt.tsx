import type { Sale } from '@pos/api/types'
import type { Ref } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { branchesQuery } from '@/features/branches'
import { useFormat, useSettings } from '@/features/settings'
import { receiptHeading } from '../lib/receipt-heading'

/** Receipt body used on screen and as the source for the downloaded PDF. */
export function Receipt({ sale, elementRef }: { sale: Sale; elementRef?: Ref<HTMLDivElement> }) {
  const { t } = useTranslation('sales')
  const { t: tm } = useTranslation('members')
  const { t: tc } = useTranslation()
  const { money, date } = useFormat()
  const shop = useSettings()
  const branches = useQuery(branchesQuery).data
  const row = 'flex justify-between gap-4'

  const heading = receiptHeading(sale, shop, branches?.find((item) => item.id === sale.branchId))
  // The tax rules the sale was rung up under, not today's settings: changing them never rewrites old bills.
  const vatRate = String(sale.vatRateBp / 100)
  const vatAdded = sale.vatMode === 'exclusive'
  const vatIncluded = sale.vatMode === 'inclusive'

  return (
    <div ref={elementRef} data-receipt-paper={shop.receiptPaperMm} className="space-y-2 font-mono text-sm tabular-nums">
      <div className="text-center">
        {shop.logoUrl && <img src={shop.logoUrl} alt="" className="mx-auto mb-1 max-h-20 max-w-[70%] object-contain" />}
        <p className="text-base font-bold">{heading.shopName}</p>
        {heading.branchName && <p>{heading.branchName}</p>}
        {heading.address && <p>{heading.address}</p>}
        {heading.phone && <p>{t('receipt.phone', { phone: heading.phone })}</p>}
        {heading.taxId && <p>{t('receipt.taxId', { taxId: heading.taxId })}</p>}
        <p className="pt-2 font-bold">{heading.isTaxInvoice ? t('receipt.titleTaxInvoice') : t('receipt.title')}</p>
        <p>{t('receipt.number', { receiptNo: sale.receiptNo })}</p>
        <p>{date.dateTime(sale.createdAt)}</p>
        <p>{t('receipt.cashier', { name: sale.cashierName })}</p>
        {sale.member && <p>{tm('title')}: {sale.member.code} / {sale.member.name}</p>}
        {sale.status === 'voided' && <p className="font-bold">{t('receipt.voided', { reason: sale.voidReason })}</p>}
      </div>
      <hr className="border-dashed border-foreground/40" />
      {sale.items.map((item, index) => (
        <div key={`${item.productId}-${index}`}>
          <p>{item.productName}</p>
          {item.options.map((option) => (
            <p key={option.optionId} className="pl-3 text-xs">
              + {option.name}
              {option.priceSatang > 0 && ` ${money.plain(option.priceSatang)}`}
            </p>
          ))}
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
      {sale.promotion && <p className="pl-3 text-xs">{t('receipt.promotion', { name: sale.promotion.name })}</p>}
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
      {shop.receiptFooter && (
        <>
          <hr className="border-dashed border-foreground/40" />
          <p className="text-center whitespace-pre-line">{shop.receiptFooter}</p>
        </>
      )}
    </div>
  )
}
