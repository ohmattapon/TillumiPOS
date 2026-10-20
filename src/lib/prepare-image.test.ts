import { afterEach, describe, expect, test } from 'bun:test'
import { prepareImage } from './prepare-image'

const globals = globalThis as { createImageBitmap?: unknown; document?: unknown }
const native = { createImageBitmap: globals.createImageBitmap, document: globals.document }
afterEach(() => Object.assign(globals, native))

/** A canvas that records what was drawn and encodes to `blob` (null when the browser cannot encode WebP). */
function stubBrowser(size: { width: number; height: number }, blob: Blob | null) {
  const seen = { closed: false, drawn: null as number[] | null, type: '', quality: 0, canvas: { width: 0, height: 0 } }
  globals.createImageBitmap = async () => ({ ...size, close: () => { seen.closed = true } })
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: (_bitmap: unknown, x: number, y: number, w: number, h: number) => { seen.drawn = [x, y, w, h] } }),
    toBlob: (done: (blob: Blob | null) => void, type: string, quality: number) => {
      seen.type = type
      seen.quality = quality
      seen.canvas = { width: canvas.width, height: canvas.height }
      done(blob)
    },
  }
  globals.document = { createElement: () => canvas }
  return seen
}

describe('prepareImage', () => {
  test('shrinks a large photo to 800 px on its longest edge and re-encodes it as WebP', async () => {
    const seen = stubBrowser({ width: 4000, height: 3000 }, new Blob(['webp'], { type: 'image/webp' }))

    const file = await prepareImage(new File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' }))

    expect(seen.canvas).toEqual({ width: 800, height: 600 })
    expect(seen.drawn).toEqual([0, 0, 800, 600])
    expect([seen.type, seen.quality]).toEqual(['image/webp', 0.85])
    expect(seen.closed).toBe(true)
    expect([file.name, file.type]).toEqual(['image.webp', 'image/webp'])
  })

  test('a smaller longest edge can be asked for', async () => {
    const seen = stubBrowser({ width: 1000, height: 500 }, new Blob(['webp'], { type: 'image/webp' }))

    await prepareImage(new File(['png'], 'logo.png', { type: 'image/png' }), 400)

    expect(seen.canvas).toEqual({ width: 400, height: 200 })
  })

  test('a small image is not enlarged', async () => {
    const seen = stubBrowser({ width: 200, height: 100 }, new Blob(['webp'], { type: 'image/webp' }))

    await prepareImage(new File(['png'], 'icon.png', { type: 'image/png' }))

    expect(seen.canvas).toEqual({ width: 200, height: 100 })
  })

  test('a browser that cannot encode the image is reported', async () => {
    stubBrowser({ width: 10, height: 10 }, null)

    await expect(prepareImage(new File(['x'], 'a.png'))).rejects.toThrow()
  })
})
