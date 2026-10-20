import { beforeEach, describe, expect, test } from 'bun:test'
import { fakeMedia, ok, pngFile, resetDatabase, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

describe('the receipt logo', () => {
  test('a shop starts with none', async () => {
    expect(ok(await owner.api.settings.get()).logoUrl).toBeNull()
  })

  test('is uploaded, shown by URL in the settings, replaced and removed', async () => {
    const first = ok(await owner.api.settings.logo.put({ file: pngFile() }))
    expect(first.logoUrl).toStartWith(`${fakeMedia.url}/logo/`)
    expect(ok(await cashier.api.settings.get()).logoUrl).toBe(first.logoUrl)
    expect(fakeMedia.objects.size).toBe(1)

    const second = ok(await owner.api.settings.logo.put({ file: pngFile() }))
    expect(second.logoUrl).not.toBe(first.logoUrl)
    expect(fakeMedia.objects.size).toBe(1)

    const removed = ok(await owner.api.settings.logo.delete())
    expect(removed.logoUrl).toBeNull()
    expect(fakeMedia.objects.size).toBe(0)
  })

  test('the storage key never appears in the settings', async () => {
    const settings = ok(await owner.api.settings.logo.put({ file: pngFile() }))

    expect(Object.keys(settings)).not.toContain('logoKey')
  })

  test('changing other settings keeps the logo', async () => {
    const withLogo = ok(await owner.api.settings.logo.put({ file: pngFile() }))

    const changed = ok(await owner.api.settings.patch({ shopName: 'ร้านใหม่' }))

    expect(changed.logoUrl).toBe(withLogo.logoUrl)
  })

  test('the logo cannot be set through the settings update', async () => {
    const attempt = await owner.api.settings.patch({ logoKey: 'logo/x.png' } as never)

    expect(attempt.status).toBeLessThan(500)
    expect(ok(await owner.api.settings.get()).logoUrl).toBeNull()
  })

  test('removing a logo that is not there is not an error', async () => {
    expect(ok(await owner.api.settings.logo.delete()).logoUrl).toBeNull()
  })

  test('only someone who may change settings can change the logo', async () => {
    expect((await cashier.api.settings.logo.put({ file: pngFile() })).status).toBe(403)
    expect((await cashier.api.settings.logo.delete()).status).toBe(403)
    expect(fakeMedia.objects.size).toBe(0)
  })

  test('the change is written to the audit log', async () => {
    await owner.api.settings.logo.put({ file: pngFile() })
    await owner.api.settings.logo.delete()

    const log = ok(await owner.api['audit-logs'].get({ query: { entityType: 'settings' } }))
    expect(log.items.map((entry) => entry.action)).toEqual(expect.arrayContaining(['settings.logo_set', 'settings.logo_removed']))
  })
})
