import { DomainError } from './errors/domain-error'

export interface LineShare {
  totalSatang: number
  vatSatang: number
}

/**
 * Splits `amount` by `weights` with the largest remainder method: every share is
 * floored, then the leftover satang go one each to the largest fractional parts
 * (the lower index on a tie). BigInt keeps `amount * weight` exact, because both
 * can approach MAX_AMOUNT_SATANG.
 */
function splitByWeights(amount: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + BigInt(w), 0n)
  // A zero-value bill has nothing to split, so the amount is dropped on purpose.
  if (sum === 0n) return weights.map(() => 0)

  const amountBig = BigInt(amount)
  const floors = weights.map((w) => (amountBig * BigInt(w)) / sum)
  const remainders = weights.map((w) => (amountBig * BigInt(w)) % sum)
  const leftover = Number(amountBig - floors.reduce((s, f) => s + f, 0n))

  const order = weights
    .map((_, i) => i)
    .sort((a, b) => {
      const ra = remainders[a]!
      const rb = remainders[b]!
      if (ra === rb) return a - b
      return ra > rb ? -1 : 1
    })

  const shares = floors.map((f) => Number(f))
  for (let k = 0; k < leftover; k++) shares[order[k]!]! += 1
  return shares
}

/**
 * Gives each line of a bill its share of the bill's total and of its VAT, weighted
 * by the line totals before discount, so reports by product or category add up to
 * the bill. Shares come back in input order.
 */
export function allocateBillToLines(
  bill: { totalSatang: number; vatSatang: number },
  lineTotals: readonly number[],
): LineShare[] {
  if (bill.totalSatang < 0 || bill.vatSatang < 0 || lineTotals.some((t) => t < 0)) {
    throw new DomainError('ยอดที่แบ่งต้องไม่ติดลบ', 'INVALID_ALLOCATION')
  }
  const totals = splitByWeights(bill.totalSatang, lineTotals)
  const vats = splitByWeights(bill.vatSatang, lineTotals)
  return lineTotals.map((_, i) => ({ totalSatang: totals[i]!, vatSatang: vats[i]! }))
}
