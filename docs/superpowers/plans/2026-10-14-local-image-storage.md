# ที่เก็บรูปสินค้าในเครื่อง Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เก็บรูปสินค้าบนดิสก์ของเครื่องร้านและให้ API เสิร์ฟเอง เลือกใช้ R2 (Worker เดิม) หรือปิดรูปได้ด้วย `MEDIA_STORAGE`

**Architecture:** เพิ่ม adapter `LocalDiskMediaStorage` หลัง port `IMediaStorage` เดิม เลือก adapter จาก `MEDIA_STORAGE` ผ่าน factory เดียว เสิร์ฟ `GET /media/*` ด้วยปลั๊กอินอ่านอย่างเดียวที่อยู่ก่อน `web.plugin` ไม่แตะ use case และสัญญา `/api/v1`

**Tech Stack:** Bun, Elysia, tsyringe, Docker Compose, bash/PowerShell

**Spec:** `docs/superpowers/specs/2026-10-14-local-image-storage-design.md`

## Global Constraints

- Branch `ohmattpon/local-image-storage` ทำใน worktree `D:\easypos-images` ห้ามแตะ working tree `D:\POS` (เจ้าของใช้ทำ README) ห้าม push ห้าม merge commit ด้วย `gitcz` เท่านั้น stage เฉพาะไฟล์ของเรื่องนั้น
- ห้ามเปลี่ยน `/api/v1` หรือ OpenAPI baseline: `bun run openapi:check` ต้องผ่านโดยไม่บันทึก baseline ใหม่
- ชนิดรูป JPEG/PNG/WebP เท่านั้น ขนาดไม่เกิน 5 MB (`5 * 1024 * 1024`) คีย์รูปแบบเดียว `products/<เลข>/<ตัวอักษร-ตัวเลข-ขีด>.<jpg|png|webp>`
- ข้อความที่ผู้ใช้อ่านเป็นภาษาไทยใน domain error พร้อม `code` คงที่ และรหัสใหม่ต้องมีคำแปลใน `apps/web/src/locales/errors.ts`
- ความลับห้ามอยู่ในไฟล์ที่ commit: `.env.example` เป็น placeholder ชุดทดสอบห้ามเรียกบริการจริง
- ก่อนบอกว่าเสร็จ: `bun run typecheck` และ `bun run test` ผ่าน (ฐานข้อมูล `pos-db-1` พอร์ต 5433 ต้องเปิดอยู่)
- ลองสคริปต์และ Docker กับ compose project แยก (`COMPOSE_PROJECT_NAME=easypos-images-test`) ใน worktree ที่มี `.env` ของตัวเอง ห้ามชี้ไปฐานข้อมูล Aiven หรือ `.env` ของเจ้าของ
- ไฟล์ `*.sh` ต้องเป็น LF

## Review Focus

- คีย์ที่พยายามออกนอกโฟลเดอร์ (`../x`, `products/1/../../x.png`, `%2e%2e`, ตัวอักษรพิเศษ) ต้องถูกปฏิเสธทั้งตอนเขียนและตอนเสิร์ฟ (Task 1, 2)
- ไฟฟ้าดับกลางการเขียน: ต้องไม่เหลือไฟล์ครึ่งเดียวที่เสิร์ฟเป็นรูป (Task 1)
- `MEDIA_STORAGE` พิมพ์ผิดหรือ `worker` โดยไม่มี URL/token: โปรแกรมต้องไม่เริ่มพร้อมข้อความชัด ไม่ใช่รูปหายเงียบ ๆ (Task 1)
- ร้านที่ใช้ Worker อยู่แล้วและไม่ตั้ง `MEDIA_STORAGE` ต้องยังใช้ Worker (Task 1)
- ปลั๊กอินเสิร์ฟต้องไม่ตอบแทน `/api/*` และไม่ถูก `web.plugin` กลืน (Task 2)
- ไฟล์สำรองที่ไม่มีไฟล์รูปคู่ ต้องกู้ฐานข้อมูลได้ตามเดิมและไม่ลบรูปที่มีอยู่ (Task 4)

---

### Task 1: ตัวเลือกที่เก็บ, adapter บนดิสก์, factory

**Files:**
- Create: `apps/api/src/libs/media-storage-mode.ts`, `apps/api/src/libs/media-storage-mode.test.ts`
- Create: `apps/api/src/modules/shared/adapters/local-disk-media-storage.ts`, `apps/api/src/modules/shared/adapters/local-disk-media-storage.test.ts`
- Create: `apps/api/src/modules/shared/adapters/disabled-media-storage.ts`
- Create: `apps/api/src/modules/shared/adapters/create-media-storage.ts`, `apps/api/src/modules/shared/adapters/create-media-storage.test.ts`
- Modify: `apps/api/src/libs/env.ts`, `apps/api/src/modules/shared/shared.module.ts`, `.gitignore`

**Interfaces:**
- Produces: `type MediaStorageMode = 'local' | 'worker' | 'none'`; `resolveMediaStorage(input?: { MEDIA_STORAGE?: string; MEDIA_URL?: string; MEDIA_TOKEN?: string }): MediaStorageMode` (throws `Error` ที่ข้อความมีชื่อตัวแปร); `env.mediaStorage: MediaStorageMode`, `env.mediaDir: string`; `isMediaKey(key: string): boolean`, `contentTypeOf(key: string): string | null`, `MAX_IMAGE_BYTES`, `class LocalDiskMediaStorage implements IMediaStorage` (constructor `(directory: string)`); `createMediaStorage(settings?: { mediaStorage; mediaDir; mediaUrl; mediaToken }): IMediaStorage`

- [ ] **Step 1: เขียนทดสอบการเลือกที่เก็บให้ล้ม**

`apps/api/src/libs/media-storage-mode.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { resolveMediaStorage } from './media-storage-mode'

describe('resolveMediaStorage', () => {
  test('nothing set: the shop keeps images on its own disk', () => {
    expect(resolveMediaStorage({})).toBe('local')
  })

  test('a Worker URL and token without a choice keeps using the Worker', () => {
    expect(resolveMediaStorage({ MEDIA_URL: 'https://m.example.com', MEDIA_TOKEN: 't' })).toBe('worker')
  })

  test('a URL without a token is not a Worker setup', () => {
    expect(resolveMediaStorage({ MEDIA_URL: 'https://m.example.com' })).toBe('local')
  })

  test('an explicit choice wins over what else is set', () => {
    expect(resolveMediaStorage({ MEDIA_STORAGE: 'local', MEDIA_URL: 'https://m.example.com', MEDIA_TOKEN: 't' })).toBe('local')
    expect(resolveMediaStorage({ MEDIA_STORAGE: 'none' })).toBe('none')
  })

  test('worker without both its URL and token stops the start with a clear message', () => {
    expect(() => resolveMediaStorage({ MEDIA_STORAGE: 'worker' })).toThrow(/MEDIA_URL and MEDIA_TOKEN/)
  })

  test('an unknown value stops the start instead of silently losing the images', () => {
    expect(() => resolveMediaStorage({ MEDIA_STORAGE: 'r2' })).toThrow(/MEDIA_STORAGE must be local, worker or none/)
  })

  test('an empty value counts as not set', () => {
    expect(resolveMediaStorage({ MEDIA_STORAGE: '' })).toBe('local')
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd apps/api && bun --env-file=.env.test test src/libs/media-storage-mode.test.ts`
Expected: FAIL — `Cannot find module './media-storage-mode'`

- [ ] **Step 3: เขียนตัวเลือก**

`apps/api/src/libs/media-storage-mode.ts`:

```ts
export type MediaStorageMode = 'local' | 'worker' | 'none'

interface MediaStorageInput {
  MEDIA_STORAGE?: string
  MEDIA_URL?: string
  MEDIA_TOKEN?: string
}

/**
 * Where product images are kept. Not set: the image Worker when its URL and token are both there (a shop
 * that already uses it changes nothing), otherwise the shop's own disk.
 */
export function resolveMediaStorage(
  input: MediaStorageInput = { MEDIA_STORAGE: Bun.env.MEDIA_STORAGE, MEDIA_URL: Bun.env.MEDIA_URL, MEDIA_TOKEN: Bun.env.MEDIA_TOKEN },
): MediaStorageMode {
  const hasWorker = Boolean(input.MEDIA_URL) && Boolean(input.MEDIA_TOKEN)
  const value = input.MEDIA_STORAGE
  if (value === undefined || value === '') return hasWorker ? 'worker' : 'local'
  if (value === 'worker' && !hasWorker) throw new Error('MEDIA_STORAGE=worker needs both MEDIA_URL and MEDIA_TOKEN')
  if (value === 'local' || value === 'worker' || value === 'none') return value
  throw new Error('MEDIA_STORAGE must be local, worker or none')
}
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `cd apps/api && bun --env-file=.env.test test src/libs/media-storage-mode.test.ts`
Expected: PASS 7/7

- [ ] **Step 5: เขียนทดสอบ adapter บนดิสก์ให้ล้ม**

`apps/api/src/modules/shared/adapters/local-disk-media-storage.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { contentTypeOf, isMediaKey, LocalDiskMediaStorage, MAX_IMAGE_BYTES } from './local-disk-media-storage'

let directory: string
let storage: LocalDiskMediaStorage

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'easypos-media-'))
  storage = new LocalDiskMediaStorage(directory)
})
afterEach(() => rm(directory, { recursive: true, force: true }))

const png = (size = 8) => new Blob([new Uint8Array(size)], { type: 'image/png' })
const filesUnder = async () => (await readdir(directory, { recursive: true })).filter((entry) => entry.includes('.'))

describe('LocalDiskMediaStorage', () => {
  test('is always enabled and links to /media/<key>', () => {
    expect(storage.isEnabled()).toBe(true)
    expect(storage.urlFor('products/1/a.png')).toBe('/media/products/1/a.png')
  })

  test('what is put can be read back from the folder', async () => {
    await storage.put('products/1/a.png', png(16))

    const stored = Bun.file(join(directory, 'products', '1', 'a.png'))
    expect(await stored.exists()).toBe(true)
    expect(stored.size).toBe(16)
  })

  test('a type that is not JPEG, PNG or WebP is refused and nothing is written', async () => {
    const gif = new Blob(['x'], { type: 'image/gif' })

    await expect(storage.put('products/1/a.png', gif)).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' })
    expect(await filesUnder()).toEqual([])
  })

  test('a file over 5 MB is refused and nothing is written', async () => {
    await expect(storage.put('products/1/a.png', png(MAX_IMAGE_BYTES + 1))).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' })
    expect(await filesUnder()).toEqual([])
  })

  test('a key outside the product image pattern is refused, so nothing can leave the folder', async () => {
    for (const key of ['../x.png', 'products/1/../../x.png', '/etc/passwd', 'products/1/a.png/../b.png', 'products/x/a.png', 'products/1/a.svg', 'products/1/%2e%2e.png'])
      await expect(storage.put(key, png())).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
    expect(await filesUnder()).toEqual([])
  })

  test('delete removes the file, and a file that is not there is not an error', async () => {
    await storage.put('products/1/a.png', png())

    await storage.delete('products/1/a.png')
    await storage.delete('products/1/a.png')
    await storage.delete('../outside.png')

    expect(await filesUnder()).toEqual([])
  })

  test('replacing a key leaves no temporary file behind', async () => {
    await storage.put('products/1/a.png', png(4))
    await storage.put('products/1/a.png', png(9))

    expect(await filesUnder()).toEqual([join('products', '1', 'a.png')])
    expect(Bun.file(join(directory, 'products', '1', 'a.png')).size).toBe(9)
  })
})

describe('media keys', () => {
  test('only the product image pattern is a key, with its content type', () => {
    expect(isMediaKey('products/12/3f2c-aa.jpg')).toBe(true)
    expect(contentTypeOf('products/12/3f2c-aa.jpg')).toBe('image/jpeg')
    expect(contentTypeOf('products/12/a.webp')).toBe('image/webp')
    expect(isMediaKey('products/12/a.png/')).toBe(false)
    expect(contentTypeOf('x.png')).toBeNull()
  })
})
```

- [ ] **Step 6: รันให้เห็นว่าล้ม**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/shared/adapters/local-disk-media-storage.test.ts`
Expected: FAIL — `Cannot find module './local-disk-media-storage'`

- [ ] **Step 7: เขียน adapter**

`apps/api/src/modules/shared/adapters/local-disk-media-storage.ts`:

```ts
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { DomainError } from '../../../domains/errors/domain-error'
import { DomainExternalServiceError } from '../../../domains/errors/domain-external-service.error'
import type { IMediaStorage } from '../ports/media-storage.port'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
// The only shape the product image use case produces. Nothing else is read or written, so a key can never climb out.
const KEY_PATTERN = /^products\/\d+\/[A-Za-z0-9-]+\.(jpg|png|webp)$/

export const isMediaKey = (key: string) => KEY_PATTERN.test(key)

export function contentTypeOf(key: string): string | null {
  const match = KEY_PATTERN.exec(key)
  return match ? CONTENT_TYPE_BY_EXTENSION[match[1]!]! : null
}

const unavailable = () =>
  new DomainExternalServiceError('เก็บรูปภาพลงเครื่องไม่ได้ ตรวจพื้นที่ว่างและสิทธิ์ของโฟลเดอร์รูป', 'MEDIA_UNAVAILABLE')

/** Keeps product images in a folder on the shop's own machine; the API serves them at /media/<key>. */
export class LocalDiskMediaStorage implements IMediaStorage {
  private readonly directory: string

  constructor(directory: string) {
    this.directory = resolve(directory)
  }

  isEnabled() {
    return true
  }

  urlFor(key: string) {
    return `/media/${key}`
  }

  async put(key: string, file: Blob) {
    const path = this.pathOf(key)
    if (path === null) throw unavailable()
    if (!(file.type in { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1 }))
      throw new DomainError('ไฟล์ต้องเป็นรูป JPEG, PNG หรือ WebP', 'INVALID_FILE_TYPE')
    if (file.size > MAX_IMAGE_BYTES) throw new DomainError('รูปต้องมีขนาดไม่เกิน 5 MB', 'IMAGE_TOO_LARGE')

    // Written under a temporary name and renamed, so a power cut never leaves half a picture under the real name.
    const temporary = `${path}.${crypto.randomUUID()}.tmp`
    try {
      await mkdir(dirname(path), { recursive: true })
      await Bun.write(temporary, file)
      await rename(temporary, path)
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {})
      console.error(`Media PUT ${key} failed:`, error)
      throw unavailable()
    }
  }

  async delete(key: string) {
    const path = this.pathOf(key)
    if (path === null) return
    await rm(path, { force: true })
  }

  private pathOf(key: string): string | null {
    if (!isMediaKey(key)) return null
    const path = resolve(this.directory, key)
    return path.startsWith(this.directory + sep) ? path : null
  }
}
```

- [ ] **Step 8: รันให้ผ่าน**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/shared/adapters/local-disk-media-storage.test.ts`
Expected: PASS 8/8

- [ ] **Step 9: เขียนทดสอบ factory ให้ล้ม**

`apps/api/src/modules/shared/adapters/create-media-storage.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { createMediaStorage } from './create-media-storage'
import { LocalDiskMediaStorage } from './local-disk-media-storage'
import { WorkerMediaStorage } from './worker-media-storage'

const base = { mediaDir: '/tmp/x', mediaUrl: null, mediaToken: null }

describe('createMediaStorage', () => {
  test('local keeps images on disk', () => {
    expect(createMediaStorage({ ...base, mediaStorage: 'local' })).toBeInstanceOf(LocalDiskMediaStorage)
  })

  test('worker uses the image Worker', () => {
    const storage = createMediaStorage({ ...base, mediaStorage: 'worker', mediaUrl: 'https://m.example.com', mediaToken: 't' })

    expect(storage).toBeInstanceOf(WorkerMediaStorage)
    expect(storage.urlFor('products/1/a.png')).toBe('https://m.example.com/products/1/a.png')
  })

  test('none is disabled: no URLs and nothing can be stored', async () => {
    const storage = createMediaStorage({ ...base, mediaStorage: 'none' })

    expect(storage.isEnabled()).toBe(false)
    expect(storage.urlFor('products/1/a.png')).toBeNull()
    await expect(storage.put('products/1/a.png', new Blob(['x']))).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
  })
})
```

- [ ] **Step 10: รันให้เห็นว่าล้ม**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/shared/adapters/create-media-storage.test.ts`
Expected: FAIL — `Cannot find module './create-media-storage'`

- [ ] **Step 11: เขียน disabled adapter, factory, env และผูกใน module**

`apps/api/src/modules/shared/adapters/disabled-media-storage.ts`:

```ts
import { DomainExternalServiceError } from '../../../domains/errors/domain-external-service.error'
import type { IMediaStorage } from '../ports/media-storage.port'

/** The shop chose to run without product images (MEDIA_STORAGE=none). */
export class DisabledMediaStorage implements IMediaStorage {
  isEnabled() {
    return false
  }

  urlFor() {
    return null
  }

  async put(): Promise<void> {
    throw this.unavailable()
  }

  async delete(): Promise<void> {
    throw this.unavailable()
  }

  private unavailable() {
    return new DomainExternalServiceError('ร้านนี้ปิดการใช้รูปสินค้าอยู่', 'MEDIA_UNAVAILABLE')
  }
}
```

`apps/api/src/modules/shared/adapters/create-media-storage.ts`:

```ts
import { env } from '../../../libs/env'
import type { MediaStorageMode } from '../../../libs/media-storage-mode'
import type { IMediaStorage } from '../ports/media-storage.port'
import { DisabledMediaStorage } from './disabled-media-storage'
import { LocalDiskMediaStorage } from './local-disk-media-storage'
import { WorkerMediaStorage } from './worker-media-storage'

interface MediaStorageSettings {
  mediaStorage: MediaStorageMode
  mediaDir: string
  mediaUrl: string | null
  mediaToken: string | null
}

/** The one place that turns the MEDIA_STORAGE choice into an adapter. */
export function createMediaStorage(settings: MediaStorageSettings = env): IMediaStorage {
  if (settings.mediaStorage === 'worker') return new WorkerMediaStorage(settings)
  if (settings.mediaStorage === 'local') return new LocalDiskMediaStorage(settings.mediaDir)
  return new DisabledMediaStorage()
}
```

ใน `apps/api/src/libs/env.ts` เพิ่ม import `import { resolveMediaStorage } from './media-storage-mode'` และสองช่องต่อจาก `mediaToken`:

```ts
  // Where product images live: local (this machine's disk), worker (apps/media on R2) or none.
  mediaStorage: resolveMediaStorage(),
  mediaDir: Bun.env.MEDIA_DIR || './data/media',
```

และปรับคอมเมนต์เหนือ `mediaUrl` เป็น `// Image Worker (apps/media), used when MEDIA_STORAGE=worker (or when it is left unset and both are set).`

ใน `apps/api/src/modules/shared/shared.module.ts` เปลี่ยน import `WorkerMediaStorage` เป็น `createMediaStorage` จาก `./adapters/create-media-storage` และบรรทัดลงทะเบียนเป็น:

```ts
container.register(TOKENS.MediaStorage, { useFactory: () => createMediaStorage() })
```

`.gitignore` เพิ่มบรรทัด `apps/api/data/`

- [ ] **Step 12: รันทั้งชุดของ API และ typecheck**

Run: `cd apps/api && bun run test:unit && cd ../.. && bun run typecheck`
Expected: unit ทั้งหมดผ่าน (เดิม + 18 ใหม่) typecheck ผ่าน

- [ ] **Step 13: รันทดสอบ integration ของรูป (ต้องยังใช้ Worker จำลอง)**

Run: `cd apps/api && bun --env-file=.env.test test src/__tests__/integration/images.integration.test.ts src/__tests__/integration/capabilities.integration.test.ts`
Expected: PASS ทั้งหมด (ชุดทดสอบตั้ง `MEDIA_URL` และ `MEDIA_TOKEN` จึงได้ `worker` โดยอัตโนมัติ)

- [ ] **Step 14: เพิ่มคำแปล `IMAGE_TOO_LARGE` ของเว็บ**

ใน `apps/web/src/locales/errors.ts` ข้างบรรทัด `INVALID_FILE_TYPE` เพิ่ม `IMAGE_TOO_LARGE: 'The image must be 5 MB or smaller.',` ให้ตรงรูปแบบของไฟล์ แล้วรัน `bun run typecheck`
Expected: ผ่าน

- [ ] **Step 15: Commit**

```bash
git add apps/api/src/libs/media-storage-mode.ts apps/api/src/libs/media-storage-mode.test.ts apps/api/src/libs/env.ts apps/api/src/modules/shared .gitignore apps/web/src/locales/errors.ts
gitcz --non-interactive --type=feat --scope=media --subject="keep product images on the shop's disk, chosen by MEDIA_STORAGE" --body="Adds LocalDiskMediaStorage and DisabledMediaStorage behind IMediaStorage, and one factory that picks between local, worker and none. Unset keeps the Worker when its URL and token are there, otherwise the disk.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: เส้นทาง `/media/*`

**Files:**
- Create: `apps/api/src/modules/media.plugin.ts`, `apps/api/src/modules/media.plugin.test.ts`
- Modify: `apps/api/src/app.ts`, `apps/web/vite.config.ts`

**Interfaces:**
- Consumes: `isMediaKey`, `contentTypeOf` จาก Task 1; `env.mediaStorage`, `env.mediaDir`
- Produces: `mediaPlugin(directory: string | null): Elysia` — `null` คือไม่เสิร์ฟอะไร

- [ ] **Step 1: เขียนทดสอบให้ล้ม**

`apps/api/src/modules/media.plugin.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Elysia } from 'elysia'
import { mediaPlugin } from './media.plugin'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'easypos-serve-'))
  await mkdir(join(directory, 'products', '1'), { recursive: true })
  await writeFile(join(directory, 'products', '1', 'a.png'), 'PNGBYTES')
  // A file next to the folder must stay unreachable.
  await writeFile(join(directory, '..', 'easypos-secret.txt'), 'secret')
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
  await rm(join(directory, '..', 'easypos-secret.txt'), { force: true })
})

const get = (app: Elysia, path: string, headers: Record<string, string> = {}) =>
  app.handle(new Request(`http://localhost${path}`, { headers }))

describe('mediaPlugin', () => {
  test('serves a stored image with its type and a cache that never expires', async () => {
    const app = new Elysia().use(mediaPlugin(directory))

    const response = await get(app, '/media/products/1/a.png')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('PNGBYTES')
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  test('an If-None-Match that matches answers 304 with no body', async () => {
    const app = new Elysia().use(mediaPlugin(directory))
    const etag = (await get(app, '/media/products/1/a.png')).headers.get('etag')!

    const response = await get(app, '/media/products/1/a.png', { 'if-none-match': etag })

    expect(response.status).toBe(304)
    expect(await response.text()).toBe('')
  })

  test('a missing image is a 404', async () => {
    const app = new Elysia().use(mediaPlugin(directory))

    expect((await get(app, '/media/products/1/missing.png')).status).toBe(404)
  })

  test('paths that try to leave the folder are a 404, plain or encoded', async () => {
    const app = new Elysia().use(mediaPlugin(directory))

    for (const path of [
      '/media/../easypos-secret.txt',
      '/media/products/1/../../../easypos-secret.txt',
      '/media/%2e%2e/easypos-secret.txt',
      '/media/products/1/%2e%2e%2f%2e%2e%2feasypos-secret.txt',
      '/media/products/1/a.png/..%2fa.png',
      '/media/easypos-secret.txt',
    ])
      expect((await get(app, path)).status).toBe(404)
  })

  test('with no folder it serves nothing', async () => {
    const app = new Elysia().use(mediaPlugin(null))

    expect((await get(app, '/media/products/1/a.png')).status).toBe(404)
  })

  test('it does not answer paths outside /media', async () => {
    const app = new Elysia().use(mediaPlugin(directory))

    expect((await get(app, '/api/v1/health')).status).toBe(404)
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/media.plugin.test.ts`
Expected: FAIL — `Cannot find module './media.plugin'`

- [ ] **Step 3: เขียนปลั๊กอิน**

`apps/api/src/modules/media.plugin.ts`:

```ts
import { resolve, sep } from 'node:path'
import { Elysia, NotFoundError } from 'elysia'
import { contentTypeOf } from './shared/adapters/local-disk-media-storage'

const PREFIX = '/media/'

/**
 * Serves the product images kept on this machine's disk at /media/<key>. Public like the image Worker:
 * a picture of a product is not a secret, and each upload has its own unguessable key, so it can be cached forever.
 */
export function mediaPlugin(directory: string | null) {
  const plugin = new Elysia({ name: 'media' })
  if (directory === null) return plugin
  const base = resolve(directory)

  return plugin.get(`${PREFIX}*`, async ({ path, request }) => {
    const key = path.slice(PREFIX.length)
    // Only the shape the upload produces is ever read; an encoded or relative path fails here.
    const type = contentTypeOf(key)
    if (type === null) throw new NotFoundError()
    const target = resolve(base, key)
    if (!target.startsWith(base + sep)) throw new NotFoundError()

    const file = Bun.file(target)
    if (!(await file.exists())) throw new NotFoundError()

    const headers = {
      'content-type': type,
      'cache-control': 'public, max-age=31536000, immutable',
      etag: `"${file.size}-${file.lastModified}"`,
    }
    if (request.headers.get('if-none-match') === headers.etag) return new Response(null, { status: 304, headers })
    return new Response(file, { headers })
  })
}
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/media.plugin.test.ts`
Expected: PASS 6/6

- [ ] **Step 5: mutation check ของตัวกัน traversal**

ชั่วคราวแก้ `contentTypeOf(key)` ในปลั๊กอินเป็น `(key.endsWith('.png') ? 'image/png' : null)` และเอาบรรทัด `if (!target.startsWith(...))` ออก รันทดสอบ
Expected: เคส `/media/%2e%2e/...` หรือ `/media/../...` ล้ม (พิสูจน์ว่าทดสอบจับการหลุดโฟลเดอร์ได้) แล้วคืนไฟล์ด้วย `git checkout -- apps/api/src/modules/media.plugin.ts` (ไฟล์ยังไม่ได้ commit ให้ใช้สำเนาที่เก็บไว้ก่อนแก้) ยืนยันด้วย `git diff` ว่าไม่มีการแก้ค้าง และรันซ้ำให้ผ่าน

- [ ] **Step 6: ผูกใน app และ proxy ของ Vite**

ใน `apps/api/src/app.ts` เพิ่ม `import { env } from './libs/env'` และ `import { mediaPlugin } from './modules/media.plugin'` แล้วเพิ่มก่อนบรรทัดคอมเมนต์ "Last, so ..." ของ web:

```ts
  // Before the web app, so /media is answered here and not by its fallback page.
  .use(mediaPlugin(env.mediaStorage === 'local' ? env.mediaDir : null))
```

ใน `apps/web/vite.config.ts` เปลี่ยน proxy เป็น `{ '/api': apiTarget, '/openapi': apiTarget, '/media': apiTarget }`

- [ ] **Step 7: ทดสอบทางผ่าน app จริงและ openapi**

Run: `cd apps/api && bun run openapi:check && cd ../.. && bun run typecheck`
Expected: `OpenAPI v1 and v2 documents match their baselines` (เส้นทาง `/media` ไม่เข้า OpenAPI เพราะไม่ใช่ `/api/v1|v2`) และ typecheck ผ่าน ถ้า openapi:check ล้มเพราะ `/media/*` โผล่ในเอกสาร ให้ตั้ง `detail: { hide: true }` ที่ route แล้วรันซ้ำ

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/media.plugin.ts apps/api/src/modules/media.plugin.test.ts apps/api/src/app.ts apps/web/vite.config.ts
gitcz --non-interactive --type=feat --scope=media --subject="serve the images kept on disk at /media" --body="Read-only, public, cached for good like the Worker. Only the product image key pattern is ever read, and the plugin sits before the web app so /media is not answered by its fallback page.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Docker และค่าตั้งค่า

**Files:**
- Modify: `docker-compose.yml`, `.env.example`

**Interfaces:**
- Produces: volume `pos-media` ที่ `/data/media` ใน service `app`; ตัวแปร `MEDIA_STORAGE`, `MEDIA_DIR` ส่งเข้า container

- [ ] **Step 1: แก้ compose**

ใน service `app` ส่วน `environment` เพิ่มต่อจาก `MEDIA_TOKEN`:

```yaml
      MEDIA_STORAGE: ${MEDIA_STORAGE:-}
      MEDIA_DIR: /data/media
```

เพิ่มใต้ `ports:` ของ `app`:

```yaml
    volumes:
      - pos-media:/data/media
```

และใน `volumes:` ท้ายไฟล์เพิ่ม `  pos-media:`

- [ ] **Step 2: แก้ `.env.example`**

แทนที่หัวข้อ "Image storage" เป็น:

```
# --- Product images ---
# local  = on this machine's disk (the default when MEDIA_URL and MEDIA_TOKEN are not both set)
# worker = the Cloudflare Worker in apps/media (needs MEDIA_URL and MEDIA_TOKEN; the default when both are set)
# none   = run without product images
# MEDIA_STORAGE=local
# Folder for local images when running outside Docker. In Docker it is the pos-media volume.
# MEDIA_DIR=./data/media
# Worker settings. Local Worker: http://localhost:8787. Deployed Worker: its workers.dev or custom domain URL.
MEDIA_URL=http://localhost:8787
# Shared by the API and the Worker. In production also set it with `wrangler secret put MEDIA_TOKEN`.
MEDIA_TOKEN=change-me
```

- [ ] **Step 3: ตรวจไฟล์**

Run: `docker compose -f docker-compose.yml config --quiet` พร้อม `JWT_SECRET=x` ใน environment ของคำสั่ง และ `cd apps/api && bun --env-file=.env.test test src/__tests__/repo-secrets.test.ts`
Expected: compose ไม่มี error และ repo-secrets ผ่าน

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
gitcz --non-interactive --type=feat --scope=install --subject="keep product images in a Docker volume" --body="The pos-media volume survives updates and rebuilds of the app image. MEDIA_STORAGE and MEDIA_DIR are passed through; the example env explains the three choices.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: สำรองและกู้คืนรูป

**Files:**
- Modify: `scripts/backup.sh`, `scripts/backup.ps1`, `scripts/restore.sh`, `scripts/restore.ps1`

**Interfaces:**
- Consumes: volume `pos-media` ที่ `/data/media` ของ service `app` (Task 3)
- Produces: ไฟล์ `<ชื่อเดียวกับ .sql.gz>.media.tar.gz` ข้างไฟล์ฐานข้อมูล เมื่อมีไฟล์รูปอยู่ (ชื่อ: แทน `.sql.gz` ด้วย `.media.tar.gz`)

- [ ] **Step 1: `backup.sh`**

ต่อท้ายก่อนบรรทัดข้อความ "Keep a copy" เพิ่ม:

```bash
# Product images kept on this machine live in the app's volume; they go in a second file with the same name.
MEDIA_FILE="${FILE%.sql.gz}.media.tar.gz"
if docker compose -f docker-compose.yml exec -T app sh -c 'find /data/media -type f 2>/dev/null | head -n 1 | grep -q .'; then
  docker compose -f docker-compose.yml exec -T app tar -czf - -C /data/media . > "$MEDIA_FILE"
  gzip -t "$MEDIA_FILE" || { rm -f "$MEDIA_FILE"; echo "The images could not be saved." >&2; exit 1; }
  echo "Images saved: $MEDIA_FILE ($(du -h "$MEDIA_FILE" | cut -f1))"
fi
```

- [ ] **Step 2: `restore.sh`**

ใส่ต่อจากบรรทัด `docker compose -f docker-compose.yml start app` และก่อน `echo "Restored from $FILE"`:

```bash
MEDIA_FILE="${FILE%.sql.gz}.media.tar.gz"
if [ -f "$MEDIA_FILE" ]; then
  gzip -t "$MEDIA_FILE" || { echo "$MEDIA_FILE is damaged; the database is restored but the images are not." >&2; exit 1; }
  echo "Restoring the images..."
  docker compose -f docker-compose.yml exec -T app sh -c 'rm -rf /data/media/* && tar -xzf - -C /data/media' < "$MEDIA_FILE"
fi
```

ให้ข้อความยืนยันบอกว่าจะกู้รูปด้วยเมื่อมีไฟล์คู่:

```bash
  [ -f "${FILE%.sql.gz}.media.tar.gz" ] && echo "  and the product images in ${FILE%.sql.gz}.media.tar.gz"
```

(วางก่อนบรรทัด `read -r -p`)

- [ ] **Step 3: `backup.ps1` และ `restore.ps1`**

`backup.ps1` ก่อนข้อความ "Keep a copy" เพิ่ม (ไฟล์ถูกสร้างใน container แล้ว copy ออก เหมือนที่ทำกับฐานข้อมูล):

```powershell
# Product images kept on this machine live in the app's volume; they go in a second file with the same name.
$mediaName = $name -replace '\.sql\.gz$', '.media.tar.gz'
$mediaFull = Join-Path (Get-Location) (Join-Path $Directory $mediaName)
docker compose -f docker-compose.yml exec -T app sh -c 'find /data/media -type f 2>/dev/null | head -n 1 | grep -q . && tar -czf /tmp/media.tar.gz -C /data/media .'
if ($LASTEXITCODE -eq 0) {
  docker compose -f docker-compose.yml cp app:/tmp/media.tar.gz $mediaFull
  docker compose -f docker-compose.yml exec -T app rm -f /tmp/media.tar.gz
  Write-Host "Images saved: $(Join-Path $Directory $mediaName)"
}
```

`restore.ps1` ก่อนบรรทัด `Write-Host "Restored from $File"` เพิ่ม:

```powershell
$mediaFile = $File -replace '\.sql\.gz$', '.media.tar.gz'
if (Test-Path $mediaFile) {
  Write-Host 'Restoring the images...'
  docker compose -f docker-compose.yml cp $mediaFile app:/tmp/media.tar.gz
  docker compose -f docker-compose.yml exec -T app sh -c 'rm -rf /data/media/* && tar -xzf /tmp/media.tar.gz -C /data/media && rm /tmp/media.tar.gz'
}
```

ตรวจไวยากรณ์: `powershell -NoProfile -Command "[void][System.Management.Automation.Language.Parser]::ParseFile('scripts/backup.ps1',[ref]$null,[ref]$e); $e"` และ `bash -n scripts/backup.sh scripts/restore.sh`
Expected: ไม่มี error

- [ ] **Step 4: ลองจริงบน compose project แยก**

ใน worktree `D:\easypos-images` สร้าง `.env` ของตัวเอง (`POSTGRES_PASSWORD`, `JWT_SECRET` ค่าทดสอบ, `PORT=3978`, `COOKIE_SECURE=false`, `CHECKOUT_MODE=shifts`) แล้ว `COMPOSE_PROJECT_NAME=easypos-images-test bash scripts/install.sh` จากนั้นด้วย curl:
1. ตั้งค่าร้านด้วยรหัสจาก log (ฟิลด์ `setupCode shopName branchName username displayName password`) เก็บ cookie
2. `GET /api/v1/capabilities`-v2 (`/api/v2/capabilities`) ได้ `imageStorage: enabled`
3. สร้างสินค้า แล้ว `PUT /api/v1/catalog/products/{id}/image` (multipart `file` เป็น PNG จริง) ได้ `imageUrl` ขึ้นต้น `/media/products/`
4. `GET <imageUrl>` ได้ 200 `image/png` ไบต์เท่าเดิม
5. `docker compose ... down` แล้ว `up -d` รูปยังอยู่ (volume)
6. `scripts/backup.sh` ได้คู่ `.sql.gz` + `.media.tar.gz` → `DELETE .../image` → 404 ที่ URL เดิม → `scripts/restore.sh <ไฟล์> --yes` → URL เดิมกลับมา 200
7. restore ด้วยไฟล์ `.sql.gz` ที่ไม่มีไฟล์คู่ (ย้ายไฟล์ media ออกชั่วคราว): กู้ฐานข้อมูลได้ รูปที่มีอยู่ไม่ถูกลบ
Expected: ทั้งเจ็ดข้อเป็นจริง บันทึกผลในรายงาน แล้วเก็บกวาดด้วย `docker compose -f docker-compose.yml down -v` (ใช้ `COMPOSE_PROJECT_NAME` เดิม)

- [ ] **Step 5: Commit**

```bash
git add scripts/backup.sh scripts/backup.ps1 scripts/restore.sh scripts/restore.ps1
gitcz --non-interactive --type=feat --scope=install --subject="back up and restore the product images with the database" --body="A second file with the same name (.media.tar.gz) is written next to the dump when images are kept on this machine, and restored with it when it is there. A dump without the images restores as before and leaves the existing images alone.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: ตรวจในเบราว์เซอร์, เอกสาร, ตรวจรวม

**Files:**
- Modify: `apps/web/e2e/run.ts`, `docs/install.md`, `AGENTS.md`, `docs/superpowers/roadmap.md`, `docs/summary.md`

- [ ] **Step 1: เพิ่มเช็กอัปโหลดรูปใน e2e**

ใน `apps/web/e2e/run.ts` ตั้ง `apiEnv` ให้ใช้ที่เก็บในเครื่องในโฟลเดอร์ชั่วคราว: เพิ่ม `MEDIA_STORAGE: 'local'` และ `MEDIA_DIR: <mkdtemp ใน os.tmpdir()>` แทน `MEDIA_URL`/`MEDIA_TOKEN` ที่ไม่เส้นทาง (ลบสองบรรทัดนั้นและคอมเมนต์ "Unroutable") แล้วเพิ่มเช็กในหมวด "Owner pages" ต่อจาก "the owner adds a category":

```ts
    await check('the owner uploads a product image, and it shows in the till after a reload', async () => {
      await owner.goto(`${WEB}/products`)
      const row = owner.getByRole('row', { name: /น้ำดื่ม 600 มล\./ })
      await row.getByRole('button', { name: /การทำงานอื่นของ น้ำดื่ม 600 มล\./ }).click()
      await owner.getByRole('menuitem', { name: 'แก้ไขสินค้า' }).click()
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
      await owner.getByRole('dialog').locator('input[type=file]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: png })
      await owner.getByRole('dialog').getByRole('button', { name: 'บันทึก' }).click()
      await owner.getByRole('dialog').waitFor({ state: 'detached' })

      await owner.goto(WEB)
      const image = owner.getByRole('img', { name: /น้ำดื่ม 600 มล\./ }).first()
      await image.waitFor()
      const loaded = await image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)
      if (!loaded) throw new Error('The product image did not load from /media')
    })
```

ถ้าตัวเลือกของ input หรือ role ของรูปไม่ตรงกับหน้าจอจริง ให้ดู `ProductFormDialog.tsx` และ `ProductCard` ของ pos แล้วปรับ locator ให้ตรง (บันทึกใน ledger) รัน `bun run e2e`
Expected: ผ่านครบ (เดิม 25 + 1)

- [ ] **Step 2: เอกสาร**

- `docs/install.md`: ตาราง `.env` แทนแถว `MEDIA_URL, MEDIA_TOKEN` เป็นสามแถว (`MEDIA_STORAGE` อธิบาย local/worker/none และค่าเริ่มต้น, `MEDIA_URL`/`MEDIA_TOKEN` ใช้เมื่อเป็น worker, `MEDIA_DIR` ใช้นอก Docker) หัวข้อสำรองข้อมูลเปลี่ยนประโยค "รูปสินค้าที่เก็บบน Cloudflare R2 ไม่อยู่ในไฟล์สำรองนี้" เป็นบอกว่ารูปที่เก็บในเครื่องอยู่ในไฟล์ `.media.tar.gz` คู่กัน ส่วนรูปบน R2 ไม่อยู่ และเพิ่มหมายเหตุว่าการเปลี่ยนที่เก็บต้องอัปโหลดรูปใหม่
- `AGENTS.md` หัวข้อการติดตั้ง: แทนข้อ "ที่เก็บรูปสินค้าเป็นของเลือกได้" ด้วยสามแบบ (`MEDIA_STORAGE` local/worker/none ผ่าน `createMediaStorage`) กฎคีย์รูปแบบเดียว และว่า `/media/*` อยู่นอก `/api/v1` ตั้งใจ
- `docs/superpowers/roadmap.md` ข้อ 13 ต่อท้ายสถานะ "เสร็จฝั่งโค้ดบน branch `ohmattpon/local-image-storage` (ต่อจาก `ohmattpon/install-kit`)"
- `docs/summary.md`: แถว roadmap ข้อ 13, ความสามารถ, ผลการตรวจ (นับทดสอบจริงหลังรัน) และข้อจำกัด (ไม่มีตัวย้ายรูป, ไม่ปรับขนาดรูป) พร้อมแก้ประโยค "ติดตั้งเสร็จแล้วยังไม่มีที่เก็บรูป" ที่ไม่จริงอีกต่อไป

- [ ] **Step 3: ตรวจรวม**

Run: `bun run typecheck && bun run test && bun run lint && (cd apps/web && bunx vite build) && (cd apps/api && bun run openapi:check) && bun run e2e`
Expected: ผ่านทั้งหมด `openapi:check` ผ่านโดยไม่บันทึก baseline ใหม่ (ลบ `test/openapi-*-current.json` ถ้ามี)

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/run.ts
gitcz --non-interactive --type=test --scope=web --subject="cover uploading a product image to the shop's disk" --body="The browser checks now run the API with images on disk and upload from the product form.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git add docs/install.md AGENTS.md docs/superpowers/roadmap.md docs/summary.md
gitcz --non-interactive --type=docs --scope=media --subject="record the local image storage in the guide, rules, roadmap and summary" --body="Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
