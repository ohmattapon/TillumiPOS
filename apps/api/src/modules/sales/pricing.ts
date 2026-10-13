import { badRequest } from '../../shared/errors'

interface Line {
  unitPriceSatang: number
  quantity: number
}

interface Payment {
  method: 'cash' | 'promptpay' | 'card'
  amountSatang: number
}

/** All amounts are integer satang. Prices include VAT, so VAT is extracted from the total. */
export function calculateTotals(lines: Line[], discountSatang: number, vatRateBp: number) {
  const subtotalSatang = lines.reduce((sum, line) => sum + line.unitPriceSatang * line.quantity, 0)
  if (discountSatang > subtotalSatang) throw badRequest('ส่วนลดมากกว่ายอดรวมสินค้า', 'DISCOUNT_TOO_LARGE')

  const totalSatang = subtotalSatang - discountSatang
  const vatSatang = Math.round((totalSatang * vatRateBp) / (10_000 + vatRateBp))

  return { subtotalSatang, discountSatang, totalSatang, vatSatang }
}

/** Validates the tendered payments against the total and works out the change. */
export function settlePayments(totalSatang: number, payments: Payment[]) {
  const paidSatang = payments.reduce((sum, payment) => sum + payment.amountSatang, 0)
  if (paidSatang < totalSatang) throw badRequest('ยอดชำระไม่ครบ', 'UNDERPAID')

  const changeSatang = paidSatang - totalSatang
  const cashSatang = payments
    .filter((payment) => payment.method === 'cash')
    .reduce((sum, payment) => sum + payment.amountSatang, 0)
  // Change can only come out of the cash drawer.
  if (changeSatang > cashSatang) throw badRequest('ยอดชำระที่ไม่ใช่เงินสดเกินยอดที่ต้องจ่าย', 'OVERPAID')

  return { paidSatang, changeSatang }
}
