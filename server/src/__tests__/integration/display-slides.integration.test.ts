import { beforeEach, describe, expect, test } from 'bun:test'
import { client, fakeMedia, ok, pngFile, resetDatabase, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

const slides = (session: Session) => session.api['display-slides']
const upload = async () => ok(await slides(owner).post({ file: pngFile() }))

describe('display slides', () => {
  test('an uploaded slide is stored and shown to a display that is not signed in', async () => {
    const slide = await upload()

    expect(slide.imageUrl).toStartWith(`${fakeMedia.url}/slides/`)
    expect(fakeMedia.objects.has(slide.imageUrl!.slice(fakeMedia.url.length + 1))).toBe(true)
    expect(ok(await client()['display-slides'].get())).toEqual({ items: [slide], total: 1 })
  })

  test('only active slides reach the display, in the order the owner chose', async () => {
    const first = await upload()
    const second = await upload()
    const hidden = await upload()
    ok(await slides(owner)({ id: hidden.id }).patch({ isActive: false }))
    ok(await slides(owner)({ id: first.id }).patch({ sortOrder: 5 }))
    ok(await slides(owner)({ id: second.id }).patch({ sortOrder: 1 }))

    const shown = ok(await client()['display-slides'].get())
    const all = ok(await slides(owner).all.get())

    expect(shown.items.map((slide) => slide.id)).toEqual([second.id, first.id])
    expect(all.total).toBe(3)
    expect(all.items.find((slide) => slide.id === hidden.id)?.isActive).toBe(false)
  })

  test('deleting a slide removes it and its stored picture', async () => {
    const slide = await upload()

    expect(ok(await slides(owner)({ id: slide.id }).delete())).toEqual({ ok: true })

    expect(ok(await client()['display-slides'].get()).total).toBe(0)
    expect(fakeMedia.objects.size).toBe(0)
  })

  test('only a user who may manage promotions can change the slides', async () => {
    const slide = await upload()

    expect((await slides(cashier).post({ file: pngFile() })).status).toBe(403)
    expect((await slides(cashier).all.get()).status).toBe(403)
    expect((await slides(cashier)({ id: slide.id }).patch({ isActive: false })).status).toBe(403)
    expect((await slides(cashier)({ id: slide.id }).delete()).status).toBe(403)
    expect((await client()['display-slides'].all.get()).status).toBe(401)
  })
})
