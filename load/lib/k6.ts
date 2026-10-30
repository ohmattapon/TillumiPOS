// Finding k6 and building its command line. Only names and the local address go on the command line, which other
// processes can read; the passwords, the PIN and the seeded ids reach k6 through its environment (see run.ts).
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { assertLocalBaseUrl } from '../k6/lib/local-url'

export interface Profile {
  name: string
  baseUrl: string
}

/** The one script k6 runs; it picks the scenarios of the profile from SCENARIO and PROFILE. Relative to the repo root. */
export const K6_ENTRY = 'load/k6/main.ts'

const INSTALL_HINT = 'k6 was not found. Install it with: winget install GrafanaLabs.k6 (then open a new terminal), or see https://grafana.com/docs/k6/latest/set-up/install-k6/'

export function buildK6Args(profile: Profile, scenario: string, outFile: string): string[] {
  assertLocalBaseUrl(profile.baseUrl)
  return ['run', '--summary-export', outFile, '--env', `SCENARIO=${scenario}`, '--env', `PROFILE=${profile.name}`, '--env', `BASE_URL=${profile.baseUrl}`, '--quiet', K6_ENTRY]
}

/** The k6 executable: on the PATH, else where the Windows installer puts it. `path` and `programFiles` are for tests. */
export async function findK6(options: { path?: string; programFiles?: string } = {}): Promise<string> {
  const fileName = process.platform === 'win32' ? 'k6.exe' : 'k6'
  const onPath = Bun.which('k6', { PATH: options.path ?? process.env.PATH ?? process.env.Path ?? '' })
  if (onPath) return onPath
  const programFiles = options.programFiles ?? process.env.ProgramFiles
  if (programFiles) {
    const installed = join(programFiles, 'k6', fileName)
    if (existsSync(installed)) return installed
  }
  throw new Error(INSTALL_HINT)
}
