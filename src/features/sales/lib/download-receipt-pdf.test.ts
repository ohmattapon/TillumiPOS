import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

interface Style { [key: string]: string }
const style = (): Style => ({})

interface TestCanvas {
  width: number
  height: number
  getContext?: () => { getImageData: () => { data: Uint8ClampedArray } }
}
let canvas: TestCanvas = { width: 300, height: 600 }
let rendered: { options: Record<string, unknown> | null } = { options: null }
const pdfs: { options: Record<string, unknown>; image: unknown[]; saved: string | null }[] = []

mock.module('html2canvas', () => ({
  default: async (_element: unknown, options: Record<string, unknown>) => {
    rendered = { options }
    return canvas
  },
}))
mock.module('jspdf', () => ({
  jsPDF: class {
    record = { options: {} as Record<string, unknown>, image: [] as unknown[], saved: null as string | null }
    constructor(options: Record<string, unknown>) {
      this.record.options = options
      pdfs.push(this.record)
    }
    addImage(...args: unknown[]) { this.record.image = args }
    save(name: string) { this.record.saved = name }
  },
}))

const { downloadReceiptPdf } = await import('./download-receipt-pdf')
const { rasterizeReceipt } = await import('./rasterize-receipt')

const globals = globalThis as { document?: unknown }
const nativeDocument = globals.document

beforeEach(() => {
  pdfs.length = 0
  canvas = { width: 300, height: 600 }
  globals.document = { fonts: { ready: Promise.resolve() } }
})
afterEach(() => { globals.document = nativeDocument })

const receipt = {} as HTMLElement

describe('downloadReceiptPdf', () => {
  test('makes one page as wide as the paper and as tall as the receipt, and saves it under the given name', async () => {
    await downloadReceiptPdf(receipt, 'receipt-1.pdf', 80)

    // 80 mm paper with a 4 mm margin leaves 72 mm; the 300x600 picture is twice as tall as wide.
    expect(pdfs[0]!.options).toMatchObject({ orientation: 'portrait', unit: 'mm', format: [80, 152], compress: true })
    expect(pdfs[0]!.image).toEqual([canvas, 'PNG', 4, 4, 72, 144])
    expect(pdfs[0]!.saved).toBe('receipt-1.pdf')
  })

  test('58 mm paper has a wider margin, and a very short receipt is laid out as landscape', async () => {
    canvas = { width: 400, height: 40 }

    await downloadReceiptPdf(receipt, 'short.pdf', 58)

    expect(pdfs[0]!.options.orientation).toBe('landscape')
    expect(pdfs[0]!.image.slice(2, 4)).toEqual([5, 5])
  })

  test('an empty picture is refused, and nothing is saved', async () => {
    canvas = { width: 0, height: 0 }

    await expect(downloadReceiptPdf(receipt, 'x.pdf', 80)).rejects.toThrow('Receipt image is empty')
    expect(pdfs).toHaveLength(0)
  })

  test('the clone that is drawn has print-safe colours and the width of the paper', async () => {
    await downloadReceiptPdf(receipt, 'a.pdf', 58)
    const onclone = rendered.options!.onclone as (document: unknown, element: unknown) => void
    const child = { style: style() }
    const cloned = { style: style(), querySelectorAll: () => [child] }
    const clonedDocument = { documentElement: { style: style() }, body: { style: style() } }

    onclone(clonedDocument, cloned)

    expect(cloned.style).toMatchObject({ width: '48mm', maxWidth: 'none', fontSize: '11px', color: '#000000', backgroundColor: '#ffffff' })
    expect(child.style).toMatchObject({ color: '#000000', borderColor: '#9ca3af', textDecorationColor: '#000000' })
    expect(clonedDocument.documentElement.style.backgroundColor).toBe('#ffffff')
    expect(clonedDocument.body.style.backgroundColor).toBe('#ffffff')
  })

  test('a cloned page without a body is still handled, and 80 mm paper uses the larger type', async () => {
    await downloadReceiptPdf(receipt, 'a.pdf', 80)
    const onclone = rendered.options!.onclone as (document: unknown, element: unknown) => void
    const cloned = { style: style(), querySelectorAll: () => [] }

    onclone({ documentElement: { style: style() }, body: null }, cloned)

    expect(cloned.style.fontSize).toBe('14px')
  })
})

describe('rasterizeReceipt rendering', () => {
  const renderedPixels = () => {
    canvas = {
      width: 2, height: 1,
      getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]) }) }),
    }
  }

  test('waits for fonts and renders printer dots without changing the source element', async () => {
    renderedPixels()
    rendered = { options: null }
    let fontsReady!: () => void
    globals.document = { fonts: { ready: new Promise<void>((resolve) => { fontsReady = resolve }) } }
    const original = { style: { color: 'theme-color' } } as unknown as HTMLElement
    const pending = rasterizeReceipt(original, 58)
    await Promise.resolve()
    expect(rendered.options).toBeNull()
    fontsReady()
    const bitmap = await pending
    expect(bitmap).toMatchObject({ widthDots: 384, heightDots: 1 })
    expect(bitmap.bits).toHaveLength(384)
    expect(bitmap.bits.slice(191, 193)).toEqual([true, false])
    expect(original.style.color).toBe('theme-color')
    expect(rendered.options).toMatchObject({ scale: 1, backgroundColor: '#ffffff', logging: false })
  })

  test.each([58, 80] as const)('uses print-safe clone colors and the %smm printer width', async (paperMm) => {
    renderedPixels()
    await rasterizeReceipt(receipt, paperMm)
    const child = { style: style() }
    const cloned = { style: style(), querySelectorAll: () => [child] }
    const clonedDocument = { documentElement: { style: style() }, body: { style: style() } }
    const onclone = rendered.options!.onclone as (document: unknown, element: unknown) => void
    onclone(clonedDocument, cloned)
    expect(cloned.style).toMatchObject({
      width: paperMm === 58 ? '384px' : '576px', maxWidth: 'none', boxSizing: 'border-box',
      fontSize: paperMm === 58 ? '11px' : '14px', backgroundColor: '#ffffff', color: '#000000',
      borderColor: '#9ca3af', outlineColor: '#000000',
    })
    expect(child.style).toEqual({ color: '#000000', borderColor: '#9ca3af', outlineColor: '#000000', textDecorationColor: '#000000' })
    expect(clonedDocument.documentElement.style.backgroundColor).toBe('#ffffff')
    expect(clonedDocument.body.style.backgroundColor).toBe('#ffffff')
  })

  test('renders a clone without a body or child elements', async () => {
    renderedPixels()
    await rasterizeReceipt(receipt, 80)
    const onclone = rendered.options!.onclone as (document: unknown, element: unknown) => void
    const cloned = { style: style(), querySelectorAll: () => [] }
    expect(() => onclone({ documentElement: { style: style() }, body: null }, cloned)).not.toThrow()
    expect(cloned.style.width).toBe('576px')
  })
})
