import { DomainExternalServiceError } from '../../../domains/errors/domain-external-service.error'
import type { IMediaStorage } from '../ports/media-storage.port'

/** The shop chose to run without product images (MEDIA_STORAGE=none). */
export class DisabledMediaStorage implements IMediaStorage {
  isEnabled() {
    return false
  }

  urlFor() {
    return null
  }

  async put(): Promise<void> {
    throw this.unavailable()
  }

  async delete(): Promise<void> {
    throw this.unavailable()
  }

  private unavailable() {
    return new DomainExternalServiceError('ร้านนี้ปิดการใช้รูปสินค้าอยู่', 'MEDIA_UNAVAILABLE')
  }
}
