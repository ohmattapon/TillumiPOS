import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

interface Style { [key: string]: string }
const style = (): Style => ({})

let canvas = { width: 300, height: 600 }
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
