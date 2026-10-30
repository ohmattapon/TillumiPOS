import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The only thing the app remembers. Never put a secret, a code or a password here. */
export interface Settings {
  printer: string | null
}

const FILE_NAME = 'settings.json'

function defaults(): Settings {
  return { printer: null }
}

/** Reads the settings under `dir`. A missing, unreadable or malformed file gives the defaults. */
export function loadSettings(dir: string): Settings {
  try {
    const data: unknown = JSON.parse(readFileSync(join(dir, FILE_NAME), 'utf8'))
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return defaults()
    const printer = (data as Record<string, unknown>).printer
    return { printer: typeof printer === 'string' && printer !== '' ? printer : null }
  } catch {
    return defaults()
  }
}

/** Writes the settings under `dir`, creating it when needed. Only the `printer` key is ever written. */
export function saveSettings(dir: string, settings: Settings): void {
  mkdirSync(dir, { recursive: true })
  const target = join(dir, FILE_NAME)
  // Written beside the file and renamed over it, so a crash never leaves half a file.
  const temp = `${target}.tmp`
  writeFileSync(temp, JSON.stringify({ printer: settings.printer }, null, 2))
  renameSync(temp, target)
}
