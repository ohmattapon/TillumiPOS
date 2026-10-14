// Browser checks for the shift workflow, with two people signed in at once.
//
//   bun run e2e            (from the repo root; the database container must be up)
//
// It never touches the development database or the real bank: it creates its own database (pos_e2e),
// starts its own API and web server on spare ports, with no SCB settings, and removes nothing of yours.
// It drives the Chrome that is already installed, headless.
import { SQL } from 'bun'
import { chromium, type Browser, type Page } from 'playwright-core'

const DB_ADMIN = 'postgres://pos:pos@localhost:5433/postgres'
const DB_NAME = 'pos_e2e'
const API_PORT = 3190
const WEB_PORT = 5290
const WEB = `http://localhost:${WEB_PORT}`
const OWNER_PASSWORD = 'e2e-owner-password'
const CASHIER_PASSWORD = 'e2e-cashier-password'
const root = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const apiEnv = {
  ...process.env,
  PORT: String(API_PORT),
  DATABASE_URL: `postgres://pos:pos@localhost:5433/${DB_NAME}`,
  JWT_SECRET: 'e2e-only-secret-e2e-only-secret-e2e-only',
  // Unroutable on purpose: these checks never store an image.
  MEDIA_URL: 'http://127.0.0.1:9',
  MEDIA_TOKEN: 'e2e-media-token',
  COOKIE_SECURE: 'false',
  SEED_OWNER_PASSWORD: OWNER_PASSWORD,
  CHECKOUT_MODE: 'shifts',
  // The bank is never part of these checks.
  SCB_API_KEY: '',
  SCB_API_SECRET: '',
  SCB_BILLER_ID: '',
  SCB_REF3_PREFIX: '',
}

const children: ReturnType<typeof Bun.spawn>[] = []
const results: { name: string; ok: boolean; detail?: string }[] = []

async function freshDatabase() {
  const admin = new SQL(DB_ADMIN)
  try {
    await admin.unsafe(`drop database if exists "${DB_NAME}" with (force)`)
    await admin.unsafe(`create database "${DB_NAME}"`)
  } finally {
    await admin.close()
  }
}

async function runOnce(args: string[]) {
  const child = Bun.spawn(['bun', ...args], { cwd: `${root}/apps/api`, env: apiEnv, stdout: 'pipe', stderr: 'pipe' })
  if ((await child.exited) !== 0) throw new Error(`${args.join(' ')} failed: ${await new Response(child.stderr).text()}`)
}

async function waitFor(url: string, label: string) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch(url)).status < 500) return
    } catch {
      // not up yet
    }
    await Bun.sleep(500)
  }
  throw new Error(`${label} did not start at ${url}`)
}

async function check(name: string, run: () => Promise<void>) {
  try {
    await run()
    results.push({ name, ok: true })
    console.log(`  ok    ${name}`)
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error)
    results.push({ name, ok: false, detail })
    console.log(`  FAIL  ${name}\n        ${detail}`)
  }
}

async function signIn(browser: Browser, username: string, password: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'th-TH' })
  const page = await context.newPage()
  page.setDefaultTimeout(15_000)
  await page.goto(WEB)
  await page.getByLabel('ชื่อผู้ใช้').fill(username)
  await page.getByLabel('รหัสผ่าน').fill(password)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.getByRole('heading', { name: /ขายสินค้า/ }).waitFor()
  return page
}

/** Puts the first seeded product in the cart and pays its exact price in cash. */
async function sellOneForCash(page: Page) {
  await page.goto(WEB)
  await page.getByRole('button', { name: /น้ำดื่ม 600 มล\./ }).first().click()
  await page.getByRole('button', { name: /^ชำระเงิน/ }).click()
  await page.getByRole('button', { name: 'พอดี' }).click()
  await page.getByRole('button', { name: 'ยืนยันการชำระ' }).click()
  await page.getByRole('button', { name: 'ขายรายการต่อไป' }).waitFor()
}

async function main() {
  console.log('Preparing a throwaway database, API and web server…')
  await freshDatabase()
  await runOnce(['src/infrastructure/database/migrate.ts'])
  await runOnce(['src/infrastructure/database/seed.ts'])

  children.push(Bun.spawn(['bun', 'src/index.ts'], { cwd: `${root}/apps/api`, env: apiEnv, stdout: 'ignore', stderr: 'inherit' }))
  children.push(
    Bun.spawn(['bun', 'x', 'vite', '--port', String(WEB_PORT), '--strictPort'], {
      cwd: `${root}/apps/web`,
      env: { ...process.env, API_TARGET: `http://localhost:${API_PORT}` },
      stdout: 'ignore',
      stderr: 'inherit',
    }),
  )
  await waitFor(`http://localhost:${API_PORT}/api/v1/health`, 'API')
  await waitFor(WEB, 'Web')

  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const owner = await signIn(browser, 'admin', OWNER_PASSWORD)

    // A second person, with their own account, on their own "till".
    const created = await owner.request.post(`${WEB}/api/v1/users`, {
      data: { username: 'cashier', password: CASHIER_PASSWORD, displayName: 'พนักงานขาย', role: 'cashier' },
    })
    if (!created.ok()) throw new Error(`Could not create the cashier: ${created.status()} ${await created.text()}`)
    const cashier = await signIn(browser, 'cashier', CASHIER_PASSWORD)

    console.log('\nShift workflow, two sessions:')

    await check('without an open shift the till says so and cannot take payment', async () => {
      await cashier.getByRole('button', { name: 'เปิดกะก่อนขาย' }).waitFor()
      await cashier.getByRole('button', { name: /น้ำดื่ม 600 มล\./ }).first().click()
      if (!(await cashier.getByRole('button', { name: /^ชำระเงิน/ }).isDisabled()))
        throw new Error('The pay button is enabled without a shift')
    })

    await check('the owner opens a shift with opening cash', async () => {
      await owner.goto(`${WEB}/shifts`)
      await owner.getByLabel('เงินตั้งต้นในลิ้นชัก').fill('100')
      await owner.getByRole('button', { name: 'เปิดกะและเริ่มขาย' }).click()
      await owner.getByRole('button', { name: 'เริ่มนับปิดกะ' }).waitFor()
    })

    await check('the other session sees the shift open and sells in it', async () => {
      await cashier.goto(WEB)
      await cashier.getByRole('button', { name: 'กะเปิดอยู่' }).waitFor()
      await sellOneForCash(cashier)
    })

    await check('the owner sells in the same shift from their own account', async () => {
      await sellOneForCash(owner)
    })

    await check('a reload keeps the shift: the till is still ready to sell', async () => {
      await cashier.reload()
      await cashier.getByRole('button', { name: 'กะเปิดอยู่' }).waitFor()
    })

    await check('the shift page shows both cash sales in the drawer entries', async () => {
      await owner.goto(`${WEB}/shifts`)
      await owner.getByText('รับเงินสดจากการขาย').nth(1).waitFor()
    })

    await check('the owner starts counting: the report is frozen and shows what the drawer should hold', async () => {
      await owner.getByRole('button', { name: 'เริ่มนับปิดกะ' }).click()
      await owner.getByText(/ยอดที่หยุดไว้ตอนเริ่มนับ/).waitFor()
      // 100.00 opening + two sales of 10.00.
      await owner.getByText('เงินสดที่ควรมี').first().waitFor()
      await owner.getByText('฿120.00').first().waitFor()
    })

    await check('the other till can no longer take payment once counting has started', async () => {
      await cashier.goto(WEB)
      await cashier.getByRole('button', { name: 'เปิดกะก่อนขาย' }).waitFor({ timeout: 20_000 })
      await cashier.getByRole('button', { name: /น้ำดื่ม 600 มล\./ }).first().click()
      if (!(await cashier.getByRole('button', { name: /^ชำระเงิน/ }).isDisabled()))
        throw new Error('The pay button is enabled while the shift is being counted')
    })

    await check('a count that differs needs a reason before the shift can be closed', async () => {
      await owner.getByLabel('เงินสดที่นับได้').fill('115')
      const close = owner.getByRole('button', { name: 'ยืนยันปิดกะ' })
      if (!(await close.isDisabled())) throw new Error('Close is enabled without a reason for the difference')
      await owner.getByLabel('เหตุผลของยอดเงินที่ต่างกัน').fill('ทอนเงินผิด')
      await close.click()
      await owner.getByRole('button', { name: 'เปิดกะและเริ่มขาย' }).waitFor()
    })

    await check('the closed shift is in the history with its difference, reason and frozen report', async () => {
      await owner.reload()
      const row = owner.getByRole('button', { name: /ปิดแล้ว/ }).first()
      await row.click()
      await owner.getByText('ทอนเงินผิด').waitFor()
      await owner.getByText('-฿5.00').waitFor()
      await owner.getByText(/ยอดที่หยุดไว้ตอนเริ่มนับ/).waitFor()
    })

    await check('in English the same screens read in English', async () => {
      const changed = await owner.request.patch(`${WEB}/api/v1/settings`, { data: { locale: 'en' } })
      if (!changed.ok()) throw new Error(`Could not switch language: ${changed.status()}`)
      await owner.goto(`${WEB}/shifts`)
      await owner.getByRole('button', { name: 'Open shift and start selling' }).waitFor()
      await owner.goto(WEB)
      await owner.getByRole('button', { name: 'Open a shift to sell' }).waitFor()
    })
  } finally {
    await browser.close()
  }
}

let failed = false
try {
  await main()
} catch (error) {
  failed = true
  console.error(error)
} finally {
  for (const child of children) {
    // On Windows the wrapper process has children of its own (the real server); take the whole tree down.
    if (process.platform === 'win32') Bun.spawnSync(['taskkill', '/F', '/T', '/PID', String(child.pid)], { stdout: 'ignore', stderr: 'ignore' })
    else child.kill()
  }
}

const failures = results.filter((result) => !result.ok)
console.log(`\n${results.length - failures.length} passed, ${failures.length} failed`)
process.exit(failed || failures.length > 0 ? 1 : 0)
