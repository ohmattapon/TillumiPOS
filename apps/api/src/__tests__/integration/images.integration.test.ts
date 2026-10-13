import { beforeEach, describe, expect, test } from 'bun:test'
import { fakeMedia, ok, pngFile, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

const keyOf = (imageUrl: string | null) => imageUrl!.slice(fakeMedia.url.length + 1)
const imageUrlOf = async (id: number) => ok(await owner.api.catalog.products({ id }).get()).imageUrl

describe('product images', () => {
  test('an upload is stored and exposed as a loadable URL', async () => {
    const product = await seedProduct(owner)

    const updated = ok(await owner.api.catalog.products({ id: product.id }).image.put({ file: pngFile() }))

    expect(updated.imageUrl).toStartWith(`${fakeMedia.url}/products/${product.id}/`)
    expect(updated.imageUrl).toEndWith('.png')
    expect(fakeMedia.objects.has(keyOf(updated.imageUrl))).toBe(true)
    expect((await fetch(updated.imageUrl!)).status).toBe(200)
    // The list endpoint must expose the same URL the POS screen renders.
    expect(ok(await owner.api.catalog.products.get({ query: {} })).items[0]!.imageUrl).toBe(updated.imageUrl)
  })

  test('replacing an image uses a new key and removes the old object', async () => {
    const product = await seedProduct(owner)
    const first = ok(await owner.api.catalog.products({ id: product.id }).image.put({ file: pngFile() }))

    const second = ok(await owner.api.catalog.products({ id: product.id }).image.put({ file: pngFile() }))

    expect(second.imageUrl).not.toBe(first.imageUrl)
    expect([...fakeMedia.objects.keys()]).toEqual([keyOf(second.imageUrl)])
  })

  test('removing an image clears the URL and deletes the object', async () => {
    const product = await seedProduct(owner)
    ok(await owner.api.catalog.products({ id: product.id }).image.put({ file: pngFile() }))

    const cleared = ok(await owner.api.catalog.products({ id: product.id }).image.delete())

    expect(cleared.imageUrl).toBeNull()
    expect(fakeMedia.objects.size).toBe(0)
  })

  test('a file whose bytes are not an image is rejected even when it claims to be one', async () => {
    const product = await seedProduct(owner)
    const disguised = new File(['not an image'], 'photo.png', { type: 'image/png' })

    const result = await owner.api.catalog.products({ id: product.id }).image.put({ file: disguised })

    expect(result.status).toBe(422)
    expect(result.error?.value).toMatchObject({ code: 'INVALID_FILE_TYPE' })
    expect(fakeMedia.objects.size).toBe(0)
    expect(await imageUrlOf(product.id)).toBeNull()
  })

  test('when storage is down the upload fails cleanly and the product is unchanged', async () => {
    const product = await seedProduct(owner)
    const before = ok(await owner.api.catalog.products({ id: product.id }).image.put({ file: pngFile() }))
    fakeMedia.setFailing(true)

    const result = await owner.api.catalog.products({ id: product.id }).image.put({ file: pngFile() })

    expect(result.status).toBe(502)
    expect(result.error?.value).toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
    fakeMedia.setFailing(false)
    expect(await imageUrlOf(product.id)).toBe(before.imageUrl)
  })

  test('an unknown product is not found and nothing is stored', async () => {
    const result = await owner.api.catalog.products({ id: 9999 }).image.put({ file: pngFile() })

    expect(result.status).toBe(404)
    expect(fakeMedia.objects.size).toBe(0)
  })
})
