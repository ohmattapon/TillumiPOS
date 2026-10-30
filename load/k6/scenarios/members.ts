// The member side of a shop: a cashier finds a member, opens the card, prices a bill that redeems points and reads
// the points history; the owner adjusts a balance.
//
// Points are earned and redeemed for real only by a sale (the checkout scenario sells to members). This scenario sells
// nothing, so it needs no shift: a redeeming quote is priced and pinned, and it spends the points only when it is paid.
// Adjusting points is the owner's command, so it is the owner who calls it.
import { check, sleep } from 'k6'
import { login, loginOwner } from '../lib/auth.ts'
import { pickCart } from '../lib/cart.ts'
import { api, type Session } from '../lib/client.ts'
import { expectPage } from '../lib/checks.ts'
import { config } from '../lib/config.ts'
import { vuRandom } from '../lib/random.ts'

export const options = {
  thresholds: {
    'http_req_duration{name:members.search}': ['p(95)<300'],
    'http_req_duration{name:members.detail}': ['p(95)<300'],
    'http_req_duration{name:members.points-history}': ['p(95)<300'],
    // A quote is a POST that only reads and prices, so it gets the read limit.
    'http_req_duration{name:members.quote-redeem}': ['p(95)<300'],
    'http_req_duration{name:members.quote-redeem-refused}': ['p(95)<300'],
    'http_req_duration{name:members.adjust}': ['p(95)<800'],
  },
}

/** The fewest points one bill may redeem; the seed leaves the shop's default (pointsMinRedeem) of 10. */
const MIN_REDEEM = 10
/** Points the owner gives or takes in one adjustment. */
const ADJUST_POINTS = 25
/** Every this many iterations a redeem for more points than the member has is tried on purpose, and must be refused. */
const REFUSED_EVERY = 4

interface Member {
  id: number
  name: string
  phone: string
  pointsBalance: number
}

let cashier: Session | undefined
let owner: Session | undefined
let random: (() => number) | undefined

export function members() {
  const { users, seed } = config()
  cashier ??= login(users[(__VU - 1) % users.length]!)
  owner ??= loginOwner()
  random ??= vuRandom('members', __VU)
  const till = api(cashier)
  const boss = api(owner)

  const memberId = seed.memberIds[Math.floor(random() * seed.memberIds.length)]!
  const detail = till.get(`/api/v1/members/${memberId}`, { expect: [200], name: 'members.detail' })
  const member = detail.status === 200 ? (detail.json() as unknown as Member) : null
  if (!check(member, { 'member card has a phone and a points balance': (row) => typeof row?.phone === 'string' && Number.isInteger(row.pointsBalance) })) {
    sleep(1)
    return
  }

  // Find the member the way a cashier does, by the phone number on the card.
  const found = expectPage<Member>(till.get(`/api/v1/members/?search=${encodeURIComponent(member!.phone)}&limit=20`, { expect: [200], name: 'members.search' }), 'member search', { minItems: 1 })
  check(found, { 'member search finds the member': (rows) => rows.some((row) => row.id === memberId) })

  // The owner tops the balance up when it is below what a bill may redeem, so every iteration can redeem.
  let balance = member!.pointsBalance
  if (balance < MIN_REDEEM + ADJUST_POINTS) {
    const topUp = boss.post(`/api/v1/members/${memberId}/points/adjustments`, { points: ADJUST_POINTS, reason: 'load test top-up' }, { expect: [200], name: 'members.adjust' })
    check(topUp, { 'adjustment returns the new balance': (res) => res.status === 200 && res.json('pointsBalance') === balance + ADJUST_POINTS })
    if (topUp.status === 200) balance += ADJUST_POINTS
  }

  // A bill that redeems the fewest points allowed: priced and pinned by the server.
  const cart = pickCart(random, seed)
  const redeemed = till.post('/api/v1/quotes/', { lines: cart.items, memberId, redeemPoints: MIN_REDEEM }, { expect: [200], name: 'members.quote-redeem' })
  check(redeemed, {
    'quote redeems the points and takes them off the total': (res) =>
      res.status === 200 && res.json('pointsRedeemed') === MIN_REDEEM && (res.json('pointsDiscountSatang') as number) > 0 && res.json('memberId') === memberId,
  })

  // Redeeming more than the balance is refused with POINTS_NOT_ENOUGH (400, a domain error), and nothing is pinned.
  if (__ITER % REFUSED_EVERY === 0) {
    const refused = till.post('/api/v1/quotes/', { lines: cart.items, memberId, redeemPoints: balance + 1 }, { expect: [400], name: 'members.quote-redeem-refused' })
    check(refused, { 'redeeming more than the balance is refused as POINTS_NOT_ENOUGH': (res) => res.status === 400 && res.json('code') === 'POINTS_NOT_ENOUGH' })
  }

  // The owner takes a few points back (a correction) and the history shows both movements, newest first.
  const taken = boss.post(`/api/v1/members/${memberId}/points/adjustments`, { points: -MIN_REDEEM, reason: 'load test correction' }, { expect: [200], name: 'members.adjust' })
  check(taken, { 'a correction lowers the balance': (res) => res.status === 200 && res.json('pointsBalance') === balance - MIN_REDEEM })

  const history = expectPage<{ kind: string; points: number }>(till.get(`/api/v1/members/${memberId}/points?limit=20`, { expect: [200], name: 'members.points-history' }), 'points history', { minItems: 1 })
  check(history, { 'history shows the correction as an adjustment': (rows) => rows.some((row) => row.kind === 'adjust' && row.points === -MIN_REDEEM) })
  sleep(1)
}
