import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DiskUpdateStaging, PACKAGE_FILENAME, PENDING_FILENAME } from './update-staging.adapter'
import type { PendingUpdate } from '../../applications/ports/update-staging.port'

let dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })))
  dirs = []
})

const scratch = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tillumi-update-'))
  dirs.push(dir)
  return dir
}

describe('DiskUpdateStaging', () => {
  test('stages the package bytes and a pending marker the installer script reads', async () => {
    const staging = new DiskUpdateStaging(await scratch())
    const data = new TextEncoder().encode('fake-release-bytes')

    const { path } = await staging.stagePackage({ version: '1.0.1', sha256: 'a'.repeat(64), data })

    expect(new Uint8Array(await readFile(path))).toEqual(data)
    const marker = JSON.parse(await readFile(join(dirname(path), PENDING_FILENAME), 'utf8')) as PendingUpdate
    expect(marker).toMatchObject({ version: '1.0.1', sha256: 'a'.repeat(64), packagePath: path })
    expect(typeof marker.stagedAt).toBe('string')
    expect(path.endsWith(join('1.0.1', PACKAGE_FILENAME))).toBe(true)
  })

  test('restaging the same version overwrites the old package', async () => {
    const staging = new DiskUpdateStaging(await scratch())
    const first = await staging.stagePackage({ version: '1.0.1', sha256: 'a'.repeat(64), data: new TextEncoder().encode('old') })
    const second = await staging.stagePackage({ version: '1.0.1', sha256: 'b'.repeat(64), data: new TextEncoder().encode('new') })

    expect(second.path).toBe(first.path)
    expect(await readFile(second.path, 'utf8')).toBe('new')
  })

  test('refuses a version that is not a strict triple', async () => {
    const staging = new DiskUpdateStaging(await scratch())

    await expect(staging.stagePackage({ version: '../evil', sha256: 'a'.repeat(64), data: new Uint8Array() })).rejects.toThrow()
    await expect(staging.stagePackage({ version: '1.0.1-beta', sha256: 'a'.repeat(64), data: new Uint8Array() })).rejects.toThrow()
  })
})
