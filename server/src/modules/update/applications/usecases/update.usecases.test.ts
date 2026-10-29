import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import {
  mockUnitOfWork,
  mockUpdateAudit,
  mockUpdateDownloader,
  mockUpdateFeed,
  mockUpdateHasher,
  mockUpdateSignatureVerifier,
  mockUpdateStaging,
} from '../../../../__tests__/mocks'
import { updateSignedMessage } from '../../../../domains/update-release'
import { APP_VERSION } from '../../../../domains/update-version'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { ApplyUpdateUseCase } from './apply-update.usecase'
import { CheckUpdateUseCase } from './check-update.usecase'

const owner = { role: 'owner' as const, id: 1, displayName: 'เจ้าของ' }
const cashier = { role: 'cashier' as const, id: 2, displayName: 'แคชเชียร์' }

const FEED_URL = 'https://github.com/ohmattapon/TillumiPOS/releases/download/v9.9.9/TillumiPOS-update-9.9.9.zip'
const SIGNATURE = 'c2lnbmF0dXJl'
const FEED_SHA = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

let feed: ReturnType<typeof mockUpdateFeed>
let downloader: ReturnType<typeof mockUpdateDownloader>
let hasher: ReturnType<typeof mockUpdateHasher>
let signatures: ReturnType<typeof mockUpdateSignatureVerifier>
let staging: ReturnType<typeof mockUpdateStaging>

beforeEach(() => {
  feed = mockUpdateFeed()
  downloader = mockUpdateDownloader()
  hasher = mockUpdateHasher()
  signatures = mockUpdateSignatureVerifier()
  staging = mockUpdateStaging()
})

const apply = (audit = mockUpdateAudit()) =>
  new ApplyUpdateUseCase(feed, downloader, hasher, signatures, staging, mockUnitOfWork(), audit)

describe('CheckUpdateUseCase', () => {
  test('reports an available update when the feed is newer', async () => {
    feed.fetchFeed.mockResolvedValue({ version: '9.9.9', sha256: FEED_SHA, url: FEED_URL, signature: SIGNATURE })

    expect(await new CheckUpdateUseCase(feed).execute()).toEqual({
      currentVersion: APP_VERSION,
      latestVersion: '9.9.9',
      updateAvailable: true,
    })
  })

  test('reports up to date when the feed matches this build', async () => {
    feed.fetchFeed.mockResolvedValue({ version: APP_VERSION, sha256: FEED_SHA, url: FEED_URL, signature: SIGNATURE })

    expect(await new CheckUpdateUseCase(feed).execute()).toMatchObject({ updateAvailable: false })
  })

  test('never offers a downgrade when the feed is older', async () => {
    feed.fetchFeed.mockResolvedValue({ version: '0.0.1', sha256: FEED_SHA, url: FEED_URL, signature: SIGNATURE })

    expect(await new CheckUpdateUseCase(feed).execute()).toMatchObject({
      currentVersion: APP_VERSION,
      latestVersion: '0.0.1',
      updateAvailable: false,
    })
  })

  test('a broken feed surfaces instead of a version answer', async () => {
    feed.fetchFeed.mockRejectedValue(
      new DomainExternalServiceError('ดึงข้อมูลอัปเดตไม่ได้ กรุณาตรวจเน็ตแล้วลองใหม่', 'UPDATE_FEED_UNAVAILABLE'),
    )

    const attempt = new CheckUpdateUseCase(feed).execute()
    await expect(attempt).rejects.toBeInstanceOf(DomainExternalServiceError)
    await expect(attempt).rejects.toMatchObject({ code: 'UPDATE_FEED_UNAVAILABLE' })
  })
})

describe('ApplyUpdateUseCase', () => {
  test('downloads, verifies, stages, audits and returns the plan', async () => {
    feed.fetchFeed.mockResolvedValue({ version: '9.9.9', sha256: FEED_SHA, url: FEED_URL, signature: SIGNATURE })
    const bytes = new TextEncoder().encode('release-bytes')
    downloader.download.mockResolvedValue(bytes)
    hasher.sha256Hex.mockReturnValue(FEED_SHA.toUpperCase())
    const audit = mockUpdateAudit()

    const result = await apply(audit).execute(undefined, owner)

    expect(result).toEqual({ staged: true, version: '9.9.9' })
    expect(downloader.download).toHaveBeenCalledWith(FEED_URL)
    expect(hasher.sha256Hex).toHaveBeenCalledWith(bytes)
    // The signature match is case-insensitive: feeds write hex either way.
    expect(staging.stagePackage).toHaveBeenCalledWith({
      version: '9.9.9',
      sha256: FEED_SHA,
      url: FEED_URL,
      signature: SIGNATURE,
      data: bytes,
    })
    expect(signatures.verify).toHaveBeenCalledWith(
      updateSignedMessage({ version: '9.9.9', sha256: FEED_SHA, url: FEED_URL }),
      SIGNATURE,
    )
    expect(audit.recordUpdate).toHaveBeenCalledTimes(1)
    const [actor, entry] = audit.recordUpdate.mock.calls[0]!
    expect(actor).toEqual({ id: owner.id, name: owner.displayName })
    expect(entry).toMatchObject({ action: 'update.applied', entityType: 'update', entityId: '9.9.9' })
  })

  test('a cashier is refused before anything is fetched', async () => {
    const attempt = apply().execute(undefined, cashier)

    await expect(attempt).rejects.toBeInstanceOf(DomainForbiddenError)
    await expect(attempt).rejects.toMatchObject({ code: 'PERMISSION_DENIED', params: { permission: 'settings.write' } })
    expect(feed.fetchFeed).not.toHaveBeenCalled()
    expect(downloader.download).not.toHaveBeenCalled()
  })

  test('a client-supplied field is rejected before anything is fetched', async () => {
    await expect(apply().execute({ url: 'https://evil.example/x.zip' }, owner)).rejects.toBeInstanceOf(ZodError)
    expect(feed.fetchFeed).not.toHaveBeenCalled()
  })

  test('refuses when already on the latest version', async () => {
    feed.fetchFeed.mockResolvedValue({ version: APP_VERSION, sha256: FEED_SHA, url: FEED_URL, signature: SIGNATURE })
    const audit = mockUpdateAudit()

    const attempt = apply(audit).execute(undefined, owner)

    await expect(attempt).rejects.toBeInstanceOf(DomainConflictError)
    await expect(attempt).rejects.toMatchObject({ code: 'UPDATE_NOT_AVAILABLE' })
    expect(downloader.download).not.toHaveBeenCalled()
    expect(staging.stagePackage).not.toHaveBeenCalled()
    expect(audit.recordUpdate).not.toHaveBeenCalled()
  })

  test('refuses a release whose signature does not verify, before downloading anything', async () => {
    feed.fetchFeed.mockResolvedValue({ version: '9.9.9', sha256: FEED_SHA, url: FEED_URL, signature: SIGNATURE })
    signatures.verify.mockReturnValue(false)
    const audit = mockUpdateAudit()

    const attempt = apply(audit).execute(undefined, owner)

    await expect(attempt).rejects.toBeInstanceOf(DomainConflictError)
    await expect(attempt).rejects.toMatchObject({ code: 'UPDATE_SIGNATURE_INVALID', params: { version: '9.9.9' } })
    expect(downloader.download).not.toHaveBeenCalled()
    expect(staging.stagePackage).not.toHaveBeenCalled()
    expect(audit.recordUpdate).not.toHaveBeenCalled()
  })

  test('a build without a publisher key refuses instead of skipping the check', async () => {
    feed.fetchFeed.mockResolvedValue({ version: '9.9.9', sha256: FEED_SHA, url: FEED_URL, signature: SIGNATURE })
    signatures.verify.mockImplementation(() => {
      throw new DomainExternalServiceError('ยังไม่มีกุญแจ', 'UPDATE_SIGNING_NOT_CONFIGURED')
    })

    await expect(apply().execute(undefined, owner)).rejects.toMatchObject({ code: 'UPDATE_SIGNING_NOT_CONFIGURED' })
    expect(downloader.download).not.toHaveBeenCalled()
    expect(staging.stagePackage).not.toHaveBeenCalled()
  })

  test('refuses a package whose hash does not match, without staging or auditing', async () => {
    feed.fetchFeed.mockResolvedValue({ version: '9.9.9', sha256: FEED_SHA, url: FEED_URL, signature: SIGNATURE })
    downloader.download.mockResolvedValue(new TextEncoder().encode('tampered-bytes'))
    hasher.sha256Hex.mockReturnValue('0'.repeat(64))
    const audit = mockUpdateAudit()

    const attempt = apply(audit).execute(undefined, owner)

    await expect(attempt).rejects.toBeInstanceOf(DomainConflictError)
    await expect(attempt).rejects.toMatchObject({ code: 'UPDATE_HASH_MISMATCH', params: { version: '9.9.9' } })
    expect(staging.stagePackage).not.toHaveBeenCalled()
    expect(audit.recordUpdate).not.toHaveBeenCalled()
  })

  test('a bad feed shape never reaches the downloader', async () => {
    feed.fetchFeed.mockRejectedValue(new DomainExternalServiceError('ข้อมูลอัปเดตไม่ถูกต้อง กรุณาแจ้งช่าง', 'UPDATE_FEED_INVALID'))

    const attempt = apply().execute(undefined, owner)

    await expect(attempt).rejects.toMatchObject({ code: 'UPDATE_FEED_INVALID' })
    expect(downloader.download).not.toHaveBeenCalled()
    expect(staging.stagePackage).not.toHaveBeenCalled()
  })

  test('a failed download never stages or audits', async () => {
    feed.fetchFeed.mockResolvedValue({ version: '9.9.9', sha256: FEED_SHA, url: FEED_URL, signature: SIGNATURE })
    downloader.download.mockRejectedValue(
      new DomainExternalServiceError('โหลดไฟล์อัปเดตไม่ได้ กรุณาตรวจเน็ตแล้วลองใหม่', 'UPDATE_DOWNLOAD_FAILED'),
    )
    const audit = mockUpdateAudit()

    await expect(apply(audit).execute(undefined, owner)).rejects.toMatchObject({ code: 'UPDATE_DOWNLOAD_FAILED' })
    expect(staging.stagePackage).not.toHaveBeenCalled()
    expect(audit.recordUpdate).not.toHaveBeenCalled()
  })
})
