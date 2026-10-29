import { injectable } from 'tsyringe'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import type { IUpdateDownloader } from '../../applications/ports/update-downloader.port'

const TIMEOUT_MS = 60_000
/** Upper bound for a release package (~100-150 MB installer payload): aborts runaway downloads. */
const MAX_PACKAGE_BYTES = 512 * 1024 * 1024

/** Fetches the release package. HTTPS only, even though the URL already passed the feed schema. */
@injectable()
export class HttpUpdateDownloader implements IUpdateDownloader {
  async download(url: string): Promise<Uint8Array> {
    let scheme: string
    try {
      scheme = new URL(url).protocol
    } catch {
      throw new DomainError('ลิงก์ไฟล์อัปเดตไม่ถูกต้อง', 'UPDATE_FEED_INVALID')
    }
    // Defense in depth: the feed schema enforces HTTPS too, but the downloader
    // never trusts its caller — an http:// package could be swapped mid-flight.
    if (scheme !== 'https:')
      throw new DomainError('ไฟล์อัปเดตต้องโหลดผ่าน HTTPS เท่านั้น', 'UPDATE_FEED_INVALID')

    let response: Response
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch {
      throw new DomainExternalServiceError('โหลดไฟล์อัปเดตไม่ได้ กรุณาตรวจเน็ตแล้วลองใหม่', 'UPDATE_DOWNLOAD_FAILED')
    }
    if (!response.ok)
      throw new DomainExternalServiceError('โหลดไฟล์อัปเดตไม่ได้ กรุณาลองใหม่อีกครั้ง', 'UPDATE_DOWNLOAD_FAILED')

    // fetch follows redirects; a package that ended up on plain http could have been swapped on the way.
    if (response.url && !response.url.startsWith('https://'))
      throw new DomainExternalServiceError('โหลดไฟล์อัปเดตไม่ได้ กรุณาลองใหม่อีกครั้ง', 'UPDATE_DOWNLOAD_FAILED')

    const buffer = await response.arrayBuffer()
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_PACKAGE_BYTES)
      throw new DomainExternalServiceError('ไฟล์อัปเดตมีขนาดผิดปกติ กรุณาลองใหม่อีกครั้ง', 'UPDATE_DOWNLOAD_FAILED')
    return new Uint8Array(buffer)
  }
}
