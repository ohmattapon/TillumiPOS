import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_WINDOW_STATE, parseWindowState } from './window-mode'
import type { WindowState } from './window-mode'

const FILE_NAME = 'window-state.json'

/** Reads the saved window state from `dir`. A missing, unreadable or corrupt file gives the default. */
export function loadWindowState(dir: string): WindowState {
  try {
    return parseWindowState(JSON.parse(readFileSync(join(dir, FILE_NAME), 'utf8')))
  } catch {
    return { ...DEFAULT_WINDOW_STATE }
  }
}

/**
 * Saves the window state into `dir`. Only the WindowState fields are written, whatever object is
 * passed in (nothing about the printer, the shop address or any token ever reaches this file).
 * The write goes to a temp file and is renamed over the old one, so a power cut leaves either the
 * old file or the new one, never half of it. A failure throws; the caller decides what to do.
 */
export function saveWindowState(dir: string, state: WindowState): void {
  const clean = parseWindowState(state)
  mkdirSync(dir, { recursive: true })
  const target = join(dir, FILE_NAME)
  const temp = `${target}.${process.pid}.tmp`
  try {
    writeFileSync(temp, `${JSON.stringify(clean)}\n`, 'utf8')
    renameSync(temp, target)
  } catch (error) {
    rmSync(temp, { force: true })
    throw error
  }
}
