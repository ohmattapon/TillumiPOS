import { beforeEach, describe, expect, test } from 'bun:test'
import { fakeMedia, ok, pngFile, resetDatabase, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

const newPromotion = async () => ok(await owner.api.promotions.post({ name: 'ลด 10%', kind: 'percent', value: 1000 }))

describe('the picture of a promotion', () => {
  test('is uploaded, shown by URL, replaced and removed', async () => {
    const promotion = await newPromotion()

    const first = ok(await owner.api.promotions({ id: promotion.id }).image.put({ file: pngFile() }))
    expect(first.imageUrl).toStartWith(`${fakeMedia.url}/promotions/${promotion.id}/`)
    expect(fakeMedia.objects.size).toBe(1)

    const second = ok(await owner.api.promotions({ id: promotion.id }).image.put({ file: pngFile() }))
    expect(second.imageUrl).not.toBe(first.imageUrl)
    expect(fakeMedia.objects.size).toBe(1)

    const removed = ok(await owner.api.promotions({ id: promotion.id }).image.delete())
    expect(removed.imageUrl).toBeNull()
    expect(fakeMedia.objects.size).toBe(0)
  })

  test('an unknown promotion is not found', async () => {
    expect((await owner.api.promotions({ id: 99999 }).image.put({ file: pngFile() })).status).toBe(404)
    expect((await owner.api.promotions({ id: 99999 }).image.delete()).status).toBe(404)
  })

  test('only the owner can change it', async () => {
    const promotion = await newPromotion()

    expect((await cashier.api.promotions({ id: promotion.id }).image.put({ file: pngFile() })).status).toBe(403)
    expect((await cashier.api.promotions({ id: promotion.id }).image.delete()).status).toBe(403)
  })
})
