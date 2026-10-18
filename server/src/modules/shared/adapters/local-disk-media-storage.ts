import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { DomainError } from '../../../domains/errors/domain-error'
import { DomainExternalServiceError } from '../../../domains/errors/domain-external-service.error'
import type { IMediaStorage } from '../ports/media-storage.port'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const ALLOWED_TYPES = new Set(Object.values(CONTENT_TYPE_BY_EXTENSION))
// The only shapes the product and promotion image use cases produce. Nothing else is read or written, so a key can never climb out.
const KEY_PATTERN = /^(products|promotions)\/\d+\/[A-Za-z0-9-]+\.(jpg|png|webp)$/

export const isMediaKey = (key: string) => KEY_PATTERN.test(key)

// The only shape the slide upload use case produces (see SlideEntity): a separate strict form,
// so the product form above is never relaxed.
const SLIDE_KEY_PATTERN = /^slides\/[A-Za-z0-9-]+\.(jpg|png|webp)$/

export const isSlideMediaKey = (key: string) => SLIDE_KEY_PATTERN.test(key)

export function contentTypeOf(key: string): string | null {
  const match = KEY_PATTERN.exec(key)
  return match ? CONTENT_TYPE_BY_EXTENSION[match[2]!]! : null
}

export function slideContentTypeOf(key: string): string | null {
  const match = SLIDE_KEY_PATTERN.exec(key)
  return match ? CONTENT_TYPE_BY_EXTENSION[match[1]!]! : null
}

const unavailable = () =>
  new DomainExternalServiceError('เก็บรูปภาพลงเครื่องไม่ได้ ตรวจพื้นที่ว่างและสิทธิ์ของโฟลเดอร์รูป', 'MEDIA_UNAVAILABLE')

/** Keeps product images in a folder on the shop's own machine; the API serves them at /media/<key>. */
export class LocalDiskMediaStorage implements IMediaStorage {
  private readonly directory: string

  constructor(directory: string) {
    this.directory = resolve(directory)
  }

  isEnabled() {
    return true
  }

  urlFor(key: string) {
    return `/media/${key}`
  }

  async put(key: string, file: Blob) {
    const path = this.pathOf(key)
    if (path === null) throw unavailable()
    if (!ALLOWED_TYPES.has(file.type)) throw new DomainError('ไฟล์ต้องเป็นรูป JPEG, PNG หรือ WebP', 'INVALID_FILE_TYPE')
    if (file.size > MAX_IMAGE_BYTES) throw new DomainError('รูปต้องมีขนาดไม่เกิน 5 MB', 'IMAGE_TOO_LARGE')

    // Written under a temporary name and renamed, so a power cut never leaves half a picture under the real name.
    const temporary = `${path}.${crypto.randomUUID()}.tmp`
    try {
      await mkdir(dirname(path), { recursive: true })
      await Bun.write(temporary, file)
      await rename(temporary, path)
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {})
      console.error(`Media PUT ${key} failed:`, error)
      throw unavailable()
    }
  }

  async delete(key: string) {
    const path = this.pathOf(key)
    if (path === null) return
    await rm(path, { force: true })
  }

  private pathOf(key: string): string | null {
    // Product and slide keys are two separate strict forms; nothing else is ever stored.
    if (!isMediaKey(key) && !isSlideMediaKey(key)) return null
    const path = resolve(this.directory, key)
    return path.startsWith(this.directory + sep) ? path : null
  }
}
