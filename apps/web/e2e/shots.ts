// Screenshots of every page at phone, small-phone and tablet/desktop sizes, to check a screen by eye before merging.
//
//   bun run screenshots                   (writes to screenshots/ at the repo root, git-ignored)
//   bun run screenshots <folder>          (another folder)
//   SHOTS_ONLY=phone,phone-short bun run screenshots   (a subset of sizes)
//
// Uses its own database (pos_e2e_shots), its own API and web server on spare ports, and never the development database.
import { SQL } from 'bun'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'playwright-core'

const DB_NAME = 'pos_e2e_shots'
const API_PORT = 3290
const WEB_PORT = 5390
const WEB = `http://localhost:${WEB_PORT}`
const PASSWORD = 'shots-owner-password'
const root = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const OUT = process.argv[2] ?? join(root, 'screenshots')

const env = {
  ...process.env,
  PORT: String(API_PORT),
  DATABASE_URL: `postgres://pos:pos@localhost:5433/${DB_NAME}`,
  JWT_SECRET: 'shots-only-secret-shots-only-secret-shots',
  MEDIA_STORAGE: 'local',
  MEDIA_DIR: await mkdtemp(join(tmpdir(), 'easypos-shots-media-')),
  MEDIA_URL: '',
  MEDIA_TOKEN: '',
  COOKIE_SECURE: 'false',
  SEED_OWNER_PASSWORD: PASSWORD,
  CHECKOUT_MODE: 'shifts',
  SCB_API_KEY: '',
  SCB_API_SECRET: '',
  SCB_BILLER_ID: '',
  SCB_REF3_PREFIX: '',
}
const children: ReturnType<typeof Bun.spawn>[] = []

async function run(args: string[]) {
  const child = Bun.spawn(['bun', ...args], { cwd: `${root}/apps/api`, env, stdout: 'pipe', stderr: 'pipe' })
  if ((await child.exited) !== 0) throw new Error(`${args.join(' ')}: ${await new Response(child.stderr).text()}`)
}
async function waitFor(url: string) {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).status < 500) return } catch {}
    await Bun.sleep(500)
  }
  throw new Error(`not up: ${url}`)
}

const sizes = [
  { name: 'phone', width: 390, height: 844 },
  // A phone with the keyboard open leaves about this much room.
  { name: 'phone-short', width: 390, height: 500 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1366, height: 900 },
]
// SHOTS_ONLY=phone,phone-short runs a subset (the shift is opened by the 'phone' pass).
const only = process.env.SHOTS_ONLY?.split(',')
const chosen = sizes.filter((size) => !only || only.includes(size.name))

async function main() {
  const admin = new SQL('postgres://pos:pos@localhost:5433/postgres')
  await admin.unsafe(`drop database if exists "${DB_NAME}" with (force)`)
  await admin.unsafe(`create database "${DB_NAME}"`)
  await admin.close()
  await run(['src/infrastructure/database/migrate.ts'])
  await run(['src/infrastructure/database/seed.ts'])
  children.push(Bun.spawn(['bun', 'src/index.ts'], { cwd: `${root}/apps/api`, env, stdout: 'ignore', stderr: 'inherit' }))
  children.push(Bun.spawn(['bun', 'x', 'vite', '--port', String(WEB_PORT), '--strictPort'], {
    cwd: `${root}/apps/web`, env: { ...process.env, API_TARGET: `http://localhost:${API_PORT}` }, stdout: 'ignore', stderr: 'inherit',
  }))
  await waitFor(`http://localhost:${API_PORT}/api/v1/health`)
  await waitFor(WEB)
  await mkdir(OUT, { recursive: true })

  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const size of chosen) {
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: 'th-TH', hasTouch: size.name !== 'desktop' })
      const page = await context.newPage()
      page.setDefaultTimeout(15_000)
      const shot = (name: string) => page.screenshot({ path: join(OUT, `${size.name}-${name}.png`) })

      await page.goto(WEB)
      await page.waitForTimeout(800)
      await shot('00-login')
      await page.getByLabel('ชื่อผู้ใช้').fill('admin')
      await page.getByLabel('รหัสผ่าน').fill(PASSWORD)
      await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
      await page.waitForTimeout(1500)
      await shot('01-pos-empty')

      if (size.name === 'phone') {
        // Open a shift once, so the till can take payment in every size.
        await page.goto(`${WEB}/shifts`)
        await page.waitForTimeout(800)
        await shot('10-shifts-closed')
        const opening = page.getByLabel('เงินตั้งต้นในลิ้นชัก')
        if (await opening.count()) {
          await opening.fill('500')
          await page.getByRole('button', { name: 'เปิดกะและเริ่มขาย' }).click()
          await page.waitForTimeout(800)
        }
        await page.goto(WEB)
        await page.waitForTimeout(1000)
      }

      // A few things in the cart.
      const products = page.getByRole('button', { name: /฿|\d+\.\d\d/ })
      for (const index of [0, 1, 1, 2]) await tryClick(page, products.nth(index))
      await page.waitForTimeout(500)
      await shot('02-pos-cart')
      await page.mouse.wheel(0, 2000)
      await page.waitForTimeout(300)
      await shot('03-pos-cart-scrolled')
      await page.mouse.wheel(0, -2000)

      // Two pay buttons exist (the wide cart and the phone bar); only the one on screen counts.
      const pay = page.getByRole('button', { name: /^ชำระเงิน/ }).and(page.locator(':visible'))
      if (await pay.count() && await pay.isEnabled()) {
        await pay.click()
        await page.waitForTimeout(600)
        await shot('04-payment')
        await page.keyboard.press('Escape')
      }

      if (size.name === 'phone-short') {
        await page.goto(`${WEB}/products`)
        await page.waitForTimeout(800)
        await page.getByRole('button', { name: /การทำงานอื่นของ/ }).first().click()
        await page.getByRole('menuitem', { name: 'แก้ไขสินค้า' }).click()
        await page.waitForTimeout(600)
        await shot('05-product-form')
        await page.keyboard.press('Escape')
      }

      for (const [name, path] of [
        ['11-today', '/today'], ['12-products', '/products'], ['13-categories', '/categories'], ['14-modifiers', '/modifiers'],
        ['15-tables', '/tables'], ['16-branches', '/branches'], ['17-users', '/users'], ['18-settings', '/settings'], ['19-shifts', '/shifts'],
      ] as const) {
        await page.goto(`${WEB}${path}`)
        await page.waitForTimeout(1000)
        await shot(name)
      }
      await shootCustomerDisplay(context, size.name)
      await context.close()
    }
  } finally {
    await browser.close()
  }
}

/** The customer's screen has no sign-in and no API, so it is fed by posting messages on the real channel. */
async function shootCustomerDisplay(context: BrowserContext, name: string) {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const lines = [
    { name: 'กาแฟเย็น', options: ['หวานน้อย'], quantity: 2, lineTotalSatang: 7000 },
    { name: 'ช็อกโกแลตแท่ง', options: [], quantity: 1, lineTotalSatang: 2500 },
  ]
  const states: [string, unknown][] = [
    ['idle', { kind: 'idle' }],
    ['selling', { kind: 'selling', lines, subtotalSatang: 9500, discountSatang: 0, vatSatang: 621, vatMode: 'inclusive', totalSatang: 9500 }],
    ['paying', { kind: 'paying', lines, totalSatang: 9500, qr: { image: png, expiresAt: new Date(Date.now() + 300_000).toISOString() } }],
    ['paid', { kind: 'paid', totalSatang: 9500, changeSatang: 500 }],
  ]
  const display = await context.newPage()
  const sender = await context.newPage()
  try {
    await display.goto(`${WEB}/customer`)
    await sender.goto(`${WEB}/customer`)
    await display.waitForTimeout(800)
    let seq = 0
    for (const [state, value] of states) {
      seq += 1
      const envelope = { v: 1, sessionId: 'shots', seq, at: Date.now(), locale: 'th', currency: 'THB', shopName: 'EasyPOS', state: value }
      await sender.evaluate((message) => {
        const channel = new BroadcastChannel('easypos-customer-display')
        channel.postMessage(message)
        channel.close()
      }, { type: 'state', envelope })
      await display.waitForTimeout(600)
      await display.screenshot({ path: join(OUT, `${name}-20-customer-${state}.png`) })
    }
  } finally {
    await display.close()
    await sender.close()
  }
}

async function tryClick(page: Page, locator: ReturnType<Page['locator']>) {
  try {
    await locator.click({ timeout: 3000 })
    // A product with option groups asks first.
    const add = page.getByRole('button', { name: 'เพิ่มลงตะกร้า' })
    if (await add.count()) await add.click({ timeout: 2000 })
  } catch {}
}

try {
  await main()
} catch (error) {
  console.error(error)
} finally {
  for (const child of children) {
    if (process.platform === 'win32') Bun.spawnSync(['taskkill', '/F', '/T', '/PID', String(child.pid)], { stdout: 'ignore', stderr: 'ignore' })
    else child.kill()
  }
}
