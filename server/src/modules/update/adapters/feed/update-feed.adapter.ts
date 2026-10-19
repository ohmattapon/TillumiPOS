import { injectable } from 'tsyringe'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import { updateFeedSchema } from '../../applications/schemas/update-schemas'
import type { IUpdateFeed, UpdateRelease } from '../../applications/ports/update-feed.port'

const TIMEOUT_MS = 10_000

/**
 * FIXED feed location, published per GitHub Release (see installer/feed.json).
 * Never client-supplied: letting a caller point the updater anywhere would
 * turn it into an arbitrary-code hole (review focus 3 of the installer plan).
 */
export const UPDATE_FEED_URL = 'https://github.com/ohmattapon/TillumiPOS/releases/latest/download/feed.json'

const unreachable = () =>
  new DomainExternalServiceError('ดึงข้อมูลอัปเดตไม่ได้ กรุณาตรวจเน็ตแล้วลองใหม่', 'UPDATE_FEED_UNAVAILABLE')

const invalid = () => new DomainExternalServiceError('ข้อมูลอัปเดตไม่ถูกต้อง กรุณาแจ้งช่าง', 'UPDATE_FEED_INVALID')

/** Reads the fixed HTTPS feed and rejects any wrong shape before it can be trusted. */
@injectable()
export class HttpUpdateFeed implements IUpdateFeed {
  async fetchFeed(): Promise<UpdateRelease> {
    let response: Response
    try {
      response = await fetch(UPDATE_FEED_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch {
      throw unreachable()
    }
    if (!response.ok) throw unreachable()

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw invalid()
    }
    const parsed = updateFeedSchema.safeParse(body)
    if (!parsed.success) throw invalid()
    return parsed.data
  }
}
