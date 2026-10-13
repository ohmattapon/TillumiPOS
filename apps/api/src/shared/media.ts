import { env } from '../config/env'
import { AppError } from './errors'

const unavailable = () => new AppError(502, 'MEDIA_UNAVAILABLE', 'เชื่อมต่อที่เก็บรูปภาพไม่ได้ ลองใหม่อีกครั้ง')

/** Client for the image Worker in apps/media, which fronts the R2 bucket. */
export abstract class MediaStorage {
  /** Public URL the browser loads the image from. */
  static urlFor(key: string) {
    return `${env.mediaUrl}/${key}`
  }

  static async put(key: string, file: File): Promise<void> {
    await MediaStorage.request('PUT', key, { headers: { 'content-type': file.type }, body: file })
  }

  static async delete(key: string): Promise<void> {
    await MediaStorage.request('DELETE', key)
  }

  private static async request(method: string, key: string, init: RequestInit = {}) {
    const response = await fetch(MediaStorage.urlFor(key), {
      ...init,
      method,
      headers: { ...init.headers, authorization: `Bearer ${env.mediaToken}` },
    }).catch(() => {
      throw unavailable()
    })
    if (!response.ok) {
      console.error(`Media ${method} ${key} failed: ${response.status} ${await response.text()}`)
      throw unavailable()
    }
  }
}
