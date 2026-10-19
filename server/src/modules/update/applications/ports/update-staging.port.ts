/** A release the server has verified and parked for the installer script. */
export interface StagedUpdate {
  staged: true
  version: string
}

/**
 * The marker `installer/scripts/apply-update.ps1` reads: which staged package
 * to install, and the signature it must still match when installation runs.
 * Written beside the package, never inside the app dir (updates never touch it).
 */
export interface PendingUpdate {
  version: string
  sha256: string
  packagePath: string
  stagedAt: string
}

/**
 * Parks a verified package where the elevated installer script finds it.
 * The use case verifies the signature BEFORE calling here, so staging itself
 * never has to decide what is trustworthy.
 */
export interface IUpdateStaging {
  stagePackage(input: { version: string; sha256: string; data: Uint8Array }): Promise<{ path: string }>
}

const updateStagingTokenSymbol: unique symbol = Symbol('IUpdateStaging')
export const updateStagingToken = updateStagingTokenSymbol.toString()
