import { beforeEach, describe, expect, test } from 'bun:test'
import { container } from 'tsyringe'
import type { ICheckoutPoints } from '../../modules/sales/applications/ports/checkout-points.port'
import { checkoutPointsToken } from '../../modules/sales/applications/ports/checkout-points.port'
import type { IUnitOfWork } from '../../modules/shared/ports/unit-of-work.port'
import { TOKENS } from '../../modules/tokens'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

const cash = (amountSatang: number) => [{ method: 'cash' as const, amountSatang }]

const createMember = async (phone = '0812345678', name = 'สมาชิกแต้ม') =>
  ok(await cashier.api.members.post({ name, phone }))

/** One point per 50 baht paid, one point worth 50 satang, redeemable from 1 point up. */
const enablePoints = async () =>
  ok(await owner.api.settings.patch({
    pointsEnabled: true, pointsEarnSatang: 5000, pointsRedeemSatang: 50, pointsMinRedeem: 1,
  }))

const movements = async (memberId: number) =>
  ok(await owner.api.members({ id: memberId }).points.get({ query: {} }))

const unitOfWork = () => container.resolve<IUnitOfWork>(TOKENS.UnitOfWork)
const ledger = () => container.resolve<ICheckoutPoints>(checkoutPointsToken)

/** The status of an answer that is expected to fail, whatever error union the route declares. */
const statusOf = (result: { error?: unknown }) => (result.error as { status?: number } | undefined)?.status

describe('member points over HTTP', () => {
  test('an owner adjusts a balance and the member history shows the movement', async () => {
    const member = await createMember()

    const adjusted = ok(await owner.api.members({ id: member.id }).points.adjustments.post({
      points: 100, reason: 'ของขวัญเปิดบัญชี',
    }))
    expect(adjusted).toEqual({ memberId: member.id, pointsBalance: 100 })
    expect(ok(await owner.api.members({ id: member.id }).get()).pointsBalance).toBe(100)

    const page = await movements(member.id)
    expect(page.total).toBe(1)
    expect(page.items[0]).toMatchObject({
      kind: 'adjust', points: 100, saleId: null, quoteId: null, reason: 'ของขวัญเปิดบัญชี', actorId: owner.user.id,
    })
  })

  test('only the owner may adjust points', async () => {
    const member = await createMember()
    const denied = await cashier.api.members({ id: member.id }).points.adjustments.post({ points: 10, reason: 'ไม่มีสิทธิ์' })
    expect(statusOf(denied)).toBe(403)
  })

  test('a balance may not go below zero and an unknown member is not found', async () => {
    const member = await createMember()

    const short = await owner.api.members({ id: member.id }).points.adjustments.post({ points: -1, reason: 'ตัดแต้ม' })
    expect(statusOf(short)).toBe(409)
    expect(short.error?.value).toMatchObject({ code: 'POINTS_NOT_ENOUGH' })
    // The refused adjustment never happened: nothing was written.
    expect((await movements(member.id)).total).toBe(0)

    const missingAdjust = await owner.api.members({ id: 999_999 }).points.adjustments.post({ points: 1, reason: 'ทดสอบ' })
    expect(statusOf(missingAdjust)).toBe(404)
    const missingList = await owner.api.members({ id: 999_999 }).points.get({ query: {} })
    expect(statusOf(missingList)).toBe(404)
  })

  test('a paid bill earns points and the ledger names the bill', async () => {
    await enablePoints()
    const member = await createMember()
    const product = await seedProduct(owner, { stock: 5, priceSatang: 2500 })

    const sale = ok(await cashier.api.sales.post({
      memberId: member.id, items: [{ productId: product.id, quantity: 4 }], payments: cash(20_000),
    }))
    expect(sale.pointsEarned).toBe(2)
    expect(sale.pointsBalanceAfter).toBe(2)

    const page = await movements(member.id)
    expect(page.items.map((movement) => movement.kind)).toEqual(['earn'])
    expect(page.items[0]).toMatchObject({ points: 2, saleId: sale.id, quoteId: null })
  })

  test('a quote holds redeemed points, the bill spends them and a void gives them back', async () => {
    await enablePoints()
    const member = await createMember()
    ok(await owner.api.members({ id: member.id }).points.adjustments.post({ points: 20, reason: 'สะสมไว้' }))
    const product = await seedProduct(owner, { stock: 5, priceSatang: 2500 })

    const quote = ok(await cashier.api.quotes.post({
      memberId: member.id, redeemPoints: 20, lines: [{ productId: product.id, quantity: 4 }],
    }))
    expect(quote.pointsRedeemed).toBe(20)
    expect(quote.pointsDiscountSatang).toBe(1000)

    const sale = ok(await cashier.api.sales.post({
      memberId: member.id, quoteId: quote.id, items: [{ productId: product.id, quantity: 4 }], payments: cash(20_000),
    }))
    expect(sale.pointsRedeemed).toBe(20)
    expect(sale.pointsEarned).toBe(1)
    expect(sale.pointsBalanceAfter).toBe(1)
    expect((await movements(member.id)).items.map((movement) => movement.kind)).toEqual(['earn', 'redeem', 'adjust'])

    ok(await owner.api.sales({ id: sale.id }).void.post({ reason: 'คืนสินค้า' }))
    expect(ok(await owner.api.members({ id: member.id }).get()).pointsBalance).toBe(20)
    expect((await movements(member.id)).items.map((movement) => movement.kind)).toEqual([
      'void_earn', 'void_redeem', 'earn', 'redeem', 'adjust',
    ])
  })

  test('the history pages and the whole ledger answers for a member that is not there', async () => {
    const member = await createMember()
    for (const points of [1, 2, 3]) {
      ok(await owner.api.members({ id: member.id }).points.adjustments.post({ points, reason: `ครั้งที่ ${points}` }))
    }

    const page = ok(await owner.api.members({ id: member.id }).points.get({ query: { limit: 2, offset: 1 } }))
    expect(page.total).toBe(3)
    expect(page.items.map((movement) => movement.points)).toEqual([2, 1])

    expect(await unitOfWork().run(() => ledger().balanceOf(999_999))).toBe(0)
    await expect(unitOfWork().run(() => ledger().lockMember(999_999))).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' })
  })

  test('the ledger records a bill once and answers what a quote still holds', async () => {
    const member = await createMember()
    const product = await seedProduct(owner, { stock: 5, priceSatang: 2500 })
    const sale = ok(await cashier.api.sales.post({
      items: [{ productId: product.id, quantity: 1 }], payments: cash(3000),
    }))

    const entry = {
      memberId: member.id, kind: 'earn' as const, points: 5, saleId: sale.id, quoteId: null, reason: null, actorId: owner.user.id,
    }
    expect(await unitOfWork().run(() => ledger().record(entry))).toEqual({ balanceAfter: 5 })
    await expect(unitOfWork().run(() => ledger().record(entry))).rejects.toMatchObject({ code: 'POINTS_ALREADY_RECORDED' })
    expect(await unitOfWork().run(() => ledger().findQuoteRedemption(999_999))).toBeNull()
  })
})
