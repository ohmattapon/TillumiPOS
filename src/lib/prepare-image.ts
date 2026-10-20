import i18n from 'i18next'

const PHOTO_MAX_EDGE = 800
const QUALITY = 0.85

/**
 * Downscales a picture to at most `maxEdge` px (800 by default) on its longest edge and re-encodes it as WebP,
 * so a multi-megabyte phone photo becomes a few dozen kilobytes before upload.
 */
export async function prepareImage(file: File, maxEdge = PHOTO_MAX_EDGE): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY))
  if (!blob) throw new Error(i18n.t('products:form.imageFailed'))
  return new File([blob], 'image.webp', { type: blob.type })
}
