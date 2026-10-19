import { DomainError } from './errors/domain-error'

/**
 * Version of this build. Bumped together with `AppVersion` in
 * `installer/tillumi.iss` on every release: the update check compares the
 * feed against exactly this string, so the two must never drift apart.
 */
export const APP_VERSION = '1.0.0'

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/

/** Strict `major.minor.patch` with digits only. The feed and APP_VERSION share this form. */
export const isUpdateVersion = (value: unknown): value is string =>
  typeof value === 'string' && VERSION_PATTERN.test(value)

const invalidVersion = (value: string) => new DomainError(`รุ่นโปรแกรมไม่ถูกต้อง: ${value}`, 'INVALID_VERSION')

function partsOf(version: string): [number, number, number] {
  const match = VERSION_PATTERN.exec(version)
  if (!match) throw invalidVersion(version)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * Numeric per segment, so 1.10.0 beats 1.9.0. Returns -1 when `a` is older,
 * 0 when equal, 1 when `a` is newer. Throws INVALID_VERSION on any other shape.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const [aMajor, aMinor, aPatch] = partsOf(a)
  const [bMajor, bMinor, bPatch] = partsOf(b)
  for (const [x, y] of [[aMajor, bMajor], [aMinor, bMinor], [aPatch, bPatch]] as const) {
    if (x < y) return -1
    if (x > y) return 1
  }
  return 0
}
