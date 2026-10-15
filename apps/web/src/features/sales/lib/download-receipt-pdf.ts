/** Saves the rendered receipt at the shop's configured thermal-paper width. */
export async function downloadReceiptPdf(
  element: HTMLElement,
  filename: string,
  paperWidthMm: 58 | 80,
) {
  await document.fonts.ready
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])

  const pageMarginMm = paperWidthMm === 58 ? 5 : 4
  const contentWidthMm = paperWidthMm - pageMarginMm * 2
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    logging: false,
    scale: 3,
    onclone: (clonedDocument, clonedElement) => {
      // html2canvas also parses the cloned page background, even though only
      // the receipt element is being rendered.
      clonedDocument.documentElement.style.backgroundColor = '#ffffff'
      if (clonedDocument.body) clonedDocument.body.style.backgroundColor = '#ffffff'

      clonedElement.style.width = `${contentWidthMm}mm`
      clonedElement.style.maxWidth = 'none'
      clonedElement.style.boxSizing = 'border-box'
      clonedElement.style.backgroundColor = '#ffffff'
      clonedElement.style.color = '#000000'
      clonedElement.style.borderColor = '#9ca3af'
      clonedElement.style.outlineColor = '#000000'
      clonedElement.style.fontSize = paperWidthMm === 58 ? '11px' : '14px'

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

  if (canvas.width === 0 || canvas.height === 0) throw new Error('Receipt image is empty')

  const contentHeightMm = (canvas.height / canvas.width) * contentWidthMm
  const pageHeightMm = contentHeightMm + pageMarginMm * 2
  const pdf = new jsPDF({
    orientation: pageHeightMm < paperWidthMm ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [paperWidthMm, pageHeightMm],
    compress: true,
  })

  pdf.addImage(canvas, 'PNG', pageMarginMm, pageMarginMm, contentWidthMm, contentHeightMm)
  pdf.save(filename)
}
