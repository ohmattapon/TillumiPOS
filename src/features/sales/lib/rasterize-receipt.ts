import { dotsForPaperMm } from '@pos/api/receipt-raster'

export interface ReceiptBitmap {
  widthDots: number
  heightDots: number
  /** Row-major, one entry per dot. true is black (burned), false is paper. */
  bits: boolean[]
}

/**
 * Turns canvas pixels into mono bits. Pure: takes raw RGBA rows so tests can
 * feed pixels without a browser canvas.
 */
export function thresholdToBits(data: Uint8ClampedArray, width: number, height: number): boolean[] {
  if (data.length !== width * height * 4) throw new Error('Pixel data does not match its dimensions')
  const bits = new Array<boolean>(width * height)
  for (let i = 0; i < width * height; i += 1) {
    const red = data[i * 4] ?? 0
    const green = data[i * 4 + 1] ?? 0
    const blue = data[i * 4 + 2] ?? 0
    // 200, not the usual 128: html2canvas anti-aliases thin Thai vowel and
    // tone marks into light gray, and 128 would burn them away. The receipt
    // background is solid white, so nothing but ink falls under 200.
    bits[i] = 0.299 * red + 0.587 * green + 0.114 * blue < 200
  }
  return bits
}

type CanvasLike = Pick<HTMLCanvasElement, 'width' | 'height' | 'getContext'>

/**
 * Reads a rendered canvas into a bitmap exactly widthDots wide. A canvas a
 * pixel or two off (html2canvas rounding) is padded white or center-cropped,
 * never stretched, so glyphs keep their shape.
 */
export function monoBitsFromCanvas(canvas: CanvasLike, widthDots: number): ReceiptBitmap {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2d context is not available')
  if (canvas.width === 0 || canvas.height === 0) throw new Error('Receipt image is empty')
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const raw = thresholdToBits(image.data, canvas.width, canvas.height)

  const bits = new Array<boolean>(widthDots * canvas.height).fill(false)
  const left = Math.floor((widthDots - canvas.width) / 2)
  for (let row = 0; row < canvas.height; row += 1) {
    for (let col = 0; col < canvas.width; col += 1) {
      const target = col + left
      if (target >= 0 && target < widthDots) bits[row * widthDots + target] = raw[row * canvas.width + col] ?? false
    }
  }
  return { widthDots, heightDots: canvas.height, bits }
}

/**
 * Renders the on-screen receipt element to a mono bitmap sized for the
 * thermal printer. The element itself is never touched: html2canvas renders a
 * clone with print-safe colors, like the PDF download does.
 */
export async function rasterizeReceipt(element: HTMLElement, paperMm: 58 | 80): Promise<ReceiptBitmap> {
  const widthDots = dotsForPaperMm(paperMm)
  await document.fonts.ready
  const { default: html2canvas } = await import('html2canvas')

  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    logging: false,
    // One CSS pixel becomes one printer dot at 203 dpi, so the clone is laid
    // out at exactly the dot width instead of being scaled afterwards.
    scale: 1,
    onclone: (clonedDocument, clonedElement) => {
      // html2canvas also parses the cloned page background, even though only
      // the receipt element is being rendered.
      clonedDocument.documentElement.style.backgroundColor = '#ffffff'
      if (clonedDocument.body) clonedDocument.body.style.backgroundColor = '#ffffff'

      clonedElement.style.width = `${widthDots}px`
      clonedElement.style.maxWidth = 'none'
      clonedElement.style.boxSizing = 'border-box'
      clonedElement.style.backgroundColor = '#ffffff'
      clonedElement.style.color = '#000000'
      clonedElement.style.borderColor = '#9ca3af'
      clonedElement.style.outlineColor = '#000000'
      clonedElement.style.fontSize = paperMm === 58 ? '11px' : '14px'

      // Tailwind v4 emits oklch colors, which html2canvas 1.4 cannot parse.
      // Inline print-safe colors in the cloned receipt so app theme colors do
      // not reach html2canvas while the on-screen receipt remains unchanged.
      clonedElement.querySelectorAll<HTMLElement>('*').forEach((child) => {
        child.style.color = '#000000'
        child.style.borderColor = '#9ca3af'
        child.style.outlineColor = '#000000'
        child.style.textDecorationColor = '#000000'
      })
    },
  })

  return monoBitsFromCanvas(canvas, widthDots)
}
