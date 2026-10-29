import { inject, injectable } from 'tsyringe'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { updateSignedMessage } from '../../../../domains/update-release'
import { APP_VERSION, compareVersions } from '../../../../domains/update-version'
import { TOKENS } from '../../../tokens'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { updateAuditToken, type IUpdateAudit } from '../ports/update-audit.port'
import { updateDownloaderToken, type IUpdateDownloader } from '../ports/update-downloader.port'
import { updateFeedToken, type IUpdateFeed } from '../ports/update-feed.port'
import { updateHasherToken, type IUpdateHasher } from '../ports/update-hasher.port'
import { updateSignatureVerifierToken, type IUpdateSignatureVerifier } from '../ports/update-signature.port'
import { updateStagingToken, type IUpdateStaging, type StagedUpdate } from '../ports/update-staging.port'
import { applyUpdateSchema } from '../schemas/update-schemas'

/**
 * Command: stages a verified release package for the installer script.
 *
 * The browser can never stop Windows services, so this use case deliberately
 * stops at staging: it checks the publisher signature of the feed entry, downloads
 * the package, verifies its SHA-256 against the signed hash HERE (a business rule,
 * hence in the core), parks
 * it with a pending-update marker, and audits. The elevated
 * `installer/scripts/apply-update.ps1` — run on the shop machine by hand —
 * does the service stop/swap/migrate/start and the rollback.
 *
 * Order matters: the download, hash check and staging all happen BEFORE the
 * unit of work, because a database transaction must never be held across a
 * call to an outside system. Only the audit record runs inside it.
 */
@injectable()
export class ApplyUpdateUseCase {
  constructor(
    @inject(updateFeedToken) private readonly feed: IUpdateFeed,
    @inject(updateDownloaderToken) private readonly downloader: IUpdateDownloader,
    @inject(updateHasherToken) private readonly hasher: IUpdateHasher,
    @inject(updateSignatureVerifierToken) private readonly signatures: IUpdateSignatureVerifier,
    @inject(updateStagingToken) private readonly staging: IUpdateStaging,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(updateAuditToken) private readonly updateAudit: IUpdateAudit,
  ) {}

  async execute(input: unknown, actor: Actor & { id: number; displayName: string }): Promise<StagedUpdate> {
    applyUpdateSchema.parse(input)
    requirePermission(actor, 'settings.write', 'เฉพาะเจ้าของร้านติดตั้งอัปเดตได้')

    const release = await this.feed.fetchFeed()
    if (compareVersions(release.version, APP_VERSION) <= 0)
      throw new DomainConflictError('เป็นรุ่นล่าสุดแล้ว ไม่ต้องอัปเดต', 'UPDATE_NOT_AVAILABLE', {
        version: release.version,
      })

    // The hash only proves the file arrived intact. Who published it is the signature, checked before
    // anything is downloaded, over the version, hash and url together.
    if (!this.signatures.verify(updateSignedMessage(release), release.signature))
      throw new DomainConflictError('ลายเซ็นของรุ่นอัปเดตไม่ถูกต้อง ไม่ติดตั้งให้', 'UPDATE_SIGNATURE_INVALID', {
        version: release.version,
      })

    const data = await this.downloader.download(release.url)
    const actual = this.hasher.sha256Hex(data)
    if (actual.toLowerCase() !== release.sha256.toLowerCase())
      throw new DomainConflictError('ไฟล์อัปเดตไม่ตรงกับลายเซ็น กรุณาลองใหม่', 'UPDATE_HASH_MISMATCH', {
        version: release.version,
      })

    const { path } = await this.staging.stagePackage({
      version: release.version,
      sha256: release.sha256.toLowerCase(),
      url: release.url,
      signature: release.signature,
      data,
    })

    await this.unitOfWork.run(() =>
      this.updateAudit.recordUpdate({ id: actor.id, name: actor.displayName }, buildAuditEntry({
        action: 'update.applied',
        entityType: 'update',
        entityId: release.version,
        summary: `เตรียมอัปเดตโปรแกรมรุ่น ${release.version}`,
        after: { version: release.version, path },
      })),
    )
    return { staged: true, version: release.version }
  }
}
