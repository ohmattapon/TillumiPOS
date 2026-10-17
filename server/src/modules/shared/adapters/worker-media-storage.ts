import { DomainExternalServiceError } from '../../../domains/errors/domain-external-service.error'
import { env } from '../../../libs/env'
import type { IMediaStorage } from '../ports/media-storage.port'

const unavailable = () =>
  new DomainExternalServiceError('เชื่อมต่อที่เก็บรูปภาพไม่ได้ หรือยังไม่ได้ตั้งค่าที่เก็บรูป', 'MEDIA_UNAVAILABLE')

interface MediaSettings {
  mediaUrl: string | null
  mediaToken: string | null
}

/**
 * Talks to the image Worker in workers/media, which fronts the R2 bucket. Created by a factory in the
 * shared module (not by the container), so a test can hand it its own settings.
 */
export class WorkerMediaStorage implements IMediaStorage {
  constructor(private readonly settings: MediaSettings = env) {}

  isEnabled() {
    return this.settings.mediaUrl !== null && this.settings.mediaToken !== null
  }

  urlFor(key: string) {
    return this.isEnabled() ? `${this.settings.mediaUrl}/${key}` : null
  }

  async put(key: string, file: Blob) {
    await this.request('PUT', key, { headers: { 'content-type': file.type }, body: file })
  }

  async delete(key: string) {
    await this.request('DELETE', key)
  }

  private async request(method: string, key: string, init: RequestInit = {}) {
    const url = this.urlFor(key)
    if (url === null) throw unavailable()

    const response = await fetch(url, {
      ...init,
      method,
      headers: { ...init.headers, authorization: `Bearer ${this.settings.mediaToken}` },
    }).catch(() => {
      throw unavailable()
    })
    if (!response.ok) {
      console.error(`Media ${method} ${key} failed: ${response.status} ${await response.text()}`)
      throw unavailable()
    }
  }
}
