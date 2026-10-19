import { mkdir, rename, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { injectable } from 'tsyringe'
import { isUpdateVersion } from '../../../../domains/update-version'
import type { IUpdateStaging, PendingUpdate } from '../../applications/ports/update-staging.port'

/**
 * Where verified packages wait for the installer script. Under the Windows
 * service the working directory IS the data dir (see installer/winsw/*.xml),
 * so the default lands in ProgramData\TillumiPOS\updates — never in the app
 * dir, which updates must not touch. Overridable for tests via UPDATE_STAGING_DIR.
 */
export const resolveStagingRoot = () => resolve(Bun.env.UPDATE_STAGING_DIR ?? './updates')

export const PACKAGE_FILENAME = 'package.zip'
export const PENDING_FILENAME = 'pending.json'

/**
 * Parks a use-case-verified package beside a pending-update marker the
 * elevated apply-update.ps1 consumes. The version is a strict triple, so the
 * directory name can never climb out of the staging root.
 */
@injectable()
export class DiskUpdateStaging implements IUpdateStaging {
  private readonly root: string

  constructor(root = resolveStagingRoot()) {
    this.root = root
  }

  async stagePackage(input: { version: string; sha256: string; data: Uint8Array }): Promise<{ path: string }> {
    // The use case only passes feed-validated versions, but staging never
    // trusts its caller with a filesystem path: reject anything but a triple.
    if (!isUpdateVersion(input.version)) throw new Error(`Refusing to stage an invalid version: ${input.version}`)
    const dir = join(this.root, input.version)
    if (!dir.startsWith(this.root + sep)) throw new Error(`Refusing to stage outside ${this.root}`)
    const packagePath = join(dir, PACKAGE_FILENAME)

    // Written under a temporary name and renamed, so a power cut never leaves
    // half a package where the installer script would pick it up.
    const temporary = `${packagePath}.${crypto.randomUUID()}.tmp`
    try {
      await mkdir(dir, { recursive: true })
      await Bun.write(temporary, input.data)
      await rename(temporary, packagePath)
      const marker: PendingUpdate = {
        version: input.version,
        sha256: input.sha256,
        packagePath,
        stagedAt: new Date().toISOString(),
      }
      await Bun.write(join(dir, PENDING_FILENAME), JSON.stringify(marker, null, 2))
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {})
      throw error
    }
    return { path: packagePath }
  }
}
