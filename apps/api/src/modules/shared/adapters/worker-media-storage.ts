import { injectable } from 'tsyringe'
import { DomainExternalServiceError } from '../../../domains/errors/domain-external-service.error'
import { env } from '../../../libs/env'
import type { IMediaStorage } from '../ports/media-storage.port'

const unavailable = () =>
  new DomainExternalServiceError('เชื่อมต่อที่เก็บรูปภาพไม่ได้ ลองใหม่อีกครั้ง', 'MEDIA_UNAVAILABLE')

/** Talks to the image Worker in apps/media, which fronts the R2 bucket. */
@injectable()
export class WorkerMediaStorage implements IMediaStorage {
  urlFor(key: string) {
    return `${env.mediaUrl}/${key}`
  }

  async put(key: string, file: Blob) {
    await this.request('PUT', key, { headers: { 'content-type': file.type }, body: file })
  }

  async delete(key: string) {
    await this.request('DELETE', key)
  }

  private async request(method: string, key: string, init: RequestInit = {}) {
    const response = await fetch(this.urlFor(key), {
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
