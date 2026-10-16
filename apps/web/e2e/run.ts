// Browser checks for the shift workflow, with two people signed in at once.
//
//   bun run e2e            (from the repo root; the database container must be up)
//
// It never touches the development database or the real bank: it creates its own databases (pos_e2e, and
// pos_e2e_setup for the first-run setup page), starts its own API and web servers on spare ports, with no
// SCB settings, and removes nothing of yours.
// It drives the Chrome that is already installed, headless.
import { SQL } from 'bun'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright-core'

const DB_ADMIN = 'postgres://pos:pos@localhost:5433/postgres'
const DB_NAME = 'pos_e2e'
const SETUP_DB_NAME = 'pos_e2e_setup'
const API_PORT = 3190
const WEB_PORT = 5290
const SETUP_API_PORT = API_PORT + 10
const SETUP_WEB_PORT = WEB_PORT + 10
const WEB = `http://localhost:${WEB_PORT}`
const SETUP_WEB = `http://localhost:${SETUP_WEB_PORT}`
const OWNER_PASSWORD = 'e2e-owner-password'
const CASHIER_PASSWORD = 'e2e-cashier-password'
const root = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const apiEnv = {
  ...process.env,
  PORT: String(API_PORT),
  DATABASE_URL: `postgres://pos:pos@localhost:5433/${DB_NAME}`,
  JWT_SECRET: 'e2e-only-secret-e2e-only-secret-e2e-only',
  // Images go to a throwaway folder on this machine, so the checks never reach a real bucket.
  MEDIA_STORAGE: 'local',
  MEDIA_DIR: await mkdtemp(join(tmpdir(), 'easypos-e2e-media-')),
  COOKIE_SECURE: 'false',
  SEED_OWNER_PASSWORD: OWNER_PASSWORD,
  CHECKOUT_MODE: 'shifts',
  // The bank is never part of these checks.
  SCB_API_KEY: '',
  SCB_API_SECRET: '',
  SCB_BILLER_ID: '',
  SCB_REF3_PREFIX: '',
}

// The same settings, pointed at a database nobody has an account in: what a fresh install looks like.
const setupApiEnv = {
  ...apiEnv,
  PORT: String(SETUP_API_PORT),
  DATABASE_URL: `postgres://pos:pos@localhost:5433/${SETUP_DB_NAME}`,
  SEED_OWNER_PASSWORD: undefined,
}

const children: ReturnType<typeof Bun.spawn>[] = []
const results: { name: string; ok: boolean; detail?: string }[] = []

async function freshDatabase(name: string) {
  const admin = new SQL(DB_ADMIN)
  try {
    await admin.unsafe(`drop database if exists "${name}" with (force)`)
    await admin.unsafe(`create database "${name}"`)
  } finally {
    await admin.close()
  }
}

async function runOnce(args: string[], env: Record<string, string | undefined> = apiEnv) {
  const child = Bun.spawn(['bun', ...args], { cwd: `${root}/apps/api`, env, stdout: 'pipe', stderr: 'pipe' })
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

async function signIn(browser: Browser, username: string, password: string, viewport = { width: 1366, height: 900 }): Promise<Page> {
  const context = await browser.newContext({ viewport, locale: 'th-TH' })
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

/** Starts an API and a web server on their own ports; returns what the API has printed so far. */
function startServers(env: Record<string, string | undefined>, apiPort: number, webPort: number): () => string {
  const api = Bun.spawn(['bun', 'src/index.ts'], { cwd: `${root}/apps/api`, env, stdout: 'pipe', stderr: 'inherit' })
  let printed = ''
  void (async () => {
    const decoder = new TextDecoder()
    for await (const chunk of api.stdout) printed += decoder.decode(chunk, { stream: true })
  })()
  children.push(api)
  children.push(
    Bun.spawn(['bun', 'x', 'vite', '--port', String(webPort), '--strictPort'], {
      cwd: `${root}/apps/web`,
      env: { ...process.env, API_TARGET: `http://localhost:${apiPort}` },
      stdout: 'ignore',
      stderr: 'inherit',
    }),
  )
  return () => printed
}

/** The first-run setup page on an empty database: the code comes from what the API prints, as it would in `docker compose logs`. */
async function runSetupFlow(browser: Browser) {
  console.log('\nFirst-run setup, empty database:')
  await freshDatabase(SETUP_DB_NAME)
  await runOnce(['src/infrastructure/database/migrate.ts'], setupApiEnv)
  const printed = startServers(setupApiEnv, SETUP_API_PORT, SETUP_WEB_PORT)
  await waitFor(`http://localhost:${SETUP_API_PORT}/api/v1/health`, 'Setup API')
  await waitFor(SETUP_WEB, 'Setup web')

  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'th-TH' })
  const page = await context.newPage()
  page.setDefaultTimeout(15_000)

  const fillForm = async (code: string) => {
    const fields: [string, string][] = [
      ['รหัสตั้งค่า', code],
      ['ชื่อร้าน', 'ร้านทดสอบ'],
      ['ชื่อสาขาแรก', 'สาขาหลัก'],
      ['ชื่อผู้ใช้ของเจ้าของ', 'shopowner'],
      ['ชื่อที่แสดง', 'เจ้าของร้าน'],
      ['รหัสผ่าน', 'e2e-first-owner-password'],
      ['ยืนยันรหัสผ่าน', 'e2e-first-owner-password'],
    ]
    for (const [label, value] of fields) await page.getByLabel(label, { exact: true }).fill(value)
  }

  try {
    await check('with nobody registered, the page asks for first-time setup instead of a sign-in', async () => {
      await page.goto(SETUP_WEB)
      await page.getByText('ตั้งค่าร้านครั้งแรก', { exact: true }).waitFor()
      if ((await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).count()) > 0)
        throw new Error('The sign-in form is shown while nobody has an account')
    })

    await check('the setup button stays disabled until a shop type is chosen', async () => {
      await fillForm('AAAAAAAAAAAA')
      if (await page.getByRole('button', { name: 'ตั้งค่าและเข้าสู่ระบบ' }).isEnabled())
        throw new Error('Setup can be sent without a shop type')
    })

    await check('a wrong setup code is refused with a message, and nothing is created', async () => {
      await fillForm('AAAAAAAAAAAA')
      await page.getByRole('radio', { name: /อื่นๆ/ }).check()
      await page.getByRole('button', { name: 'ตั้งค่าและเข้าสู่ระบบ' }).click()
      await page.getByRole('alert').getByText(/รหัสตั้งค่าไม่ถูกต้อง/).waitFor()
      const status = await (await fetch(`http://localhost:${SETUP_API_PORT}/api/v1/setup`)).json()
      if (status.needsSetup !== true) throw new Error('A wrong code ended the setup')
    })

    await check('the code printed by the API creates the owner and signs in', async () => {
      let code: string | undefined
      for (let attempt = 0; attempt < 30 && code === undefined; attempt++) {
        code = /SETUP CODE[^:]*:\s+([A-Z0-9]{12})/.exec(printed())?.[1]
        if (code === undefined) await Bun.sleep(500)
      }
      if (code === undefined) throw new Error('The API did not print a setup code')
      await page.getByLabel('รหัสตั้งค่า', { exact: true }).fill(code)
      await page.getByRole('button', { name: 'ตั้งค่าและเข้าสู่ระบบ' }).click()
      await page.getByRole('heading', { name: /ขายสินค้า/ }).waitFor()
    })

    await check('after a reload the owner is still signed in and the setup page is gone', async () => {
      await page.reload()
      await page.getByRole('heading', { name: /ขายสินค้า/ }).waitFor()
      if ((await page.getByText('ตั้งค่าร้านครั้งแรก', { exact: true }).count()) > 0)
        throw new Error('The setup page is still shown after setup')
    })
  } finally {
    await context.close()
  }
}

async function main() {
  console.log('Preparing a throwaway database, API and web server…')
  await freshDatabase(DB_NAME)
  await runOnce(['src/infrastructure/database/migrate.ts'])
  await runOnce(['src/infrastructure/database/seed.ts'])

  startServers(apiEnv, API_PORT, WEB_PORT)
  await waitFor(`http://localhost:${API_PORT}/api/v1/health`, 'API')
  await waitFor(WEB, 'Web')

  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    await runSetupFlow(browser)

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

    await check('on a phone the cashier sells with the cart bar: open the cart, change the quantity both ways, pay', async () => {
      const phone = await signIn(browser, 'cashier', CASHIER_PASSWORD, { width: 390, height: 844 })
      try {
        await phone.getByRole('button', { name: /น้ำดื่ม 600 มล\./ }).first().click()
        // The bar shows the count and the total; a tap opens the whole cart. Up then down leaves one bottle.
        await phone.getByRole('button', { name: /1 ชิ้น/ }).click()
        await phone.getByRole('dialog').getByRole('button', { name: 'เพิ่มจำนวน น้ำดื่ม 600 มล.' }).click()
        await phone.getByRole('dialog').getByRole('button', { name: 'ลดจำนวน น้ำดื่ม 600 มล.' }).click()
        await phone.getByRole('dialog').getByRole('button', { name: /^ชำระเงิน/ }).click()
        await phone.getByRole('button', { name: 'พอดี' }).click()
        await phone.getByRole('button', { name: 'ยืนยันการชำระ' }).click()
        await phone.getByRole('button', { name: 'ขายรายการต่อไป' }).waitFor()
      } finally {
        await phone.context().close()
      }
    })

    await check('the customer screen needs no sign-in, then follows the cashier: the item and total, then paid, then idle', async () => {
      // A stranger's browser: no session. The screen must neither show a login page nor ask the API for anything.
      const stranger = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'th-TH' })
      try {
        const bare = await stranger.newPage()
        bare.setDefaultTimeout(15_000)
        const apiCalls: string[] = []
        bare.on('request', (request) => {
          if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls.push(request.url())
        })
        await bare.goto(`${WEB}/customer`)
        await bare.getByText('ยินดีต้อนรับ').waitFor()
        if (apiCalls.length > 0) throw new Error(`The customer screen called the API: ${apiCalls[0]}`)
      } finally {
        await stranger.close()
      }

      // In the cashier's own browser the screen follows what is on the counter.
      const display = await cashier.context().newPage()
      display.setDefaultTimeout(15_000)
      try {
        await display.goto(`${WEB}/customer`)
        await cashier.goto(WEB)
        await cashier.getByRole('button', { name: /น้ำดื่ม 600 มล\./ }).first().click()
        await display.getByText('น้ำดื่ม 600 มล.').waitFor()
        await display.getByText('ยอดสุทธิ').waitFor()
        await cashier.getByRole('button', { name: /^ชำระเงิน/ }).click()
        // Not cash: the checks that close the shift assert exactly what the drawer should hold (฿160.00, and
        // a difference of -฿25.00), so this sale must not add to it.
        await cashier.getByRole('button', { name: 'พร้อมเพย์' }).click()
        await cashier.getByRole('button', { name: 'ยืนยันการชำระ' }).click()
        await display.getByText('ชำระแล้ว').waitFor()
        await cashier.getByRole('button', { name: 'ขายรายการต่อไป' }).click()
        // The till ends the paid screen itself after a few seconds.
        await display.getByText('ยินดีต้อนรับ').waitFor({ timeout: 10_000 })
      } finally {
        await display.close()
      }
    })

    await check('with a tax ID the receipt is an abbreviated tax invoice, ends with the footer and prints 48 mm wide on 58 mm paper', async () => {
      const changed = await owner.request.patch(`${WEB}/api/v1/settings`, {
        data: { taxId: '0105500000000', receiptFooter: 'ขอบคุณที่ใช้บริการ', receiptPaperMm: 58 },
      })
      if (!changed.ok()) throw new Error(`Could not change the settings: ${changed.status()}`)
      await sellOneForCash(owner)
      const receipt = owner.getByRole('dialog')
      await receipt.getByText('ใบกำกับภาษีอย่างย่อ').waitFor()
      await receipt.getByText('เลขประจำตัวผู้เสียภาษี 0105500000000').waitFor()
      await receipt.getByText('ขอบคุณที่ใช้บริการ').waitFor()

      await owner.emulateMedia({ media: 'print' })
      const widthMm = await receipt.evaluate((element) => (element.getBoundingClientRect().width * 25.4) / 96)
      const appVisible = await owner.locator('#root').isVisible()
      await owner.emulateMedia({ media: 'screen' })
      if (Math.abs(widthMm - 48) > 0.5) throw new Error(`The printed receipt is ${widthMm.toFixed(1)} mm wide, not 48`)
      if (appVisible) throw new Error('The app behind the receipt would be printed too')
    })

    await check('the sale made before the tax ID was set still prints as a plain receipt', async () => {
      await owner.goto(`${WEB}/today`)
      // Newest first: the last row is the cashier's sale, made before the settings changed.
      await owner.getByRole('row').nth(3).waitFor()
      await owner.getByRole('row').last().click()
      const detail = owner.getByRole('dialog')
      await detail.getByText('ใบเสร็จรับเงิน').waitFor()
      if ((await detail.getByText('ใบกำกับภาษีอย่างย่อ').count()) > 0) throw new Error('An old sale turned into a tax invoice')
      if ((await detail.getByText(/เลขประจำตัวผู้เสียภาษี/).count()) > 0) throw new Error('An old sale gained a tax ID')
    })

    console.log('\nPromotions:')

    await check('the owner sets up a 10% promotion, the till shows it, and the receipt names it', async () => {
      await owner.goto(`${WEB}/promotions`)
      await owner.getByRole('button', { name: 'เพิ่มโปรโมชัน' }).click()
      const form = owner.getByRole('dialog')
      await form.getByLabel('ชื่อโปรโมชัน').fill('ลดเปิดร้าน')
      await form.getByLabel('ส่วนลด (%)').fill('10')
      await form.getByRole('button', { name: 'บันทึก' }).click()
      await owner.getByRole('dialog').waitFor({ state: 'detached' })
      await owner.getByText('ลดเปิดร้าน').first().waitFor()

      await owner.goto(WEB)
      await owner.getByRole('button', { name: /น้ำดื่ม 600 มล\./ }).first().click()
      await owner.getByText('โปรโมชัน: ลดเปิดร้าน').waitFor()
      await owner.getByRole('button', { name: /^ชำระเงิน/ }).click()
      await owner.getByRole('button', { name: 'พอดี' }).click()
      await owner.getByRole('button', { name: 'ยืนยันการชำระ' }).click()
      const receipt = owner.getByRole('dialog')
      await receipt.getByText('โปรโมชัน: ลดเปิดร้าน').waitFor()
      await receipt.getByRole('button', { name: 'ขายรายการต่อไป' }).waitFor()
    })

    await check('a cashier sees the promotion but cannot add one', async () => {
      await cashier.goto(`${WEB}/promotions`)
      await cashier.getByText('ลดเปิดร้าน').first().waitFor()
      if ((await cashier.getByRole('button', { name: 'เพิ่มโปรโมชัน' }).count()) > 0)
        throw new Error('A cashier can add promotions')
    })

    await check('the promotion is switched off so the checks after it price as before', async () => {
      const listed = await owner.request.get(`${WEB}/api/v1/promotions`)
      const { items } = (await listed.json()) as { items: { id: number }[] }
      for (const { id } of items) {
        const off = await owner.request.patch(`${WEB}/api/v1/promotions/${id}`, { data: { isActive: false } })
        if (!off.ok()) throw new Error(`Could not switch the promotion off: ${off.status()}`)
      }
    })

    console.log('\nModifiers:')

    await check('the owner sets up a group with a priced option on the modifiers page', async () => {
      await owner.goto(`${WEB}/modifiers`)
      await owner.getByRole('button', { name: 'เพิ่มกลุ่มตัวเลือก' }).click()
      const form = owner.getByRole('dialog')
      await form.getByLabel('ชื่อกลุ่ม').fill('ท็อปปิง')
      await form.getByLabel('เลือกได้สูงสุด').fill('2')
      await form.getByRole('button', { name: 'บันทึก' }).click()
      await owner.getByRole('heading', { name: 'ท็อปปิง' }).waitFor()

      await owner.getByRole('button', { name: 'เพิ่มตัวเลือก' }).click()
      const option = owner.getByRole('dialog')
      await option.getByLabel('ชื่อตัวเลือก').fill('ไข่มุก')
      await option.getByLabel(/ราคาเพิ่ม/).fill('10')
      await option.getByLabel(/ต้นทุน/).fill('4')
      await option.getByRole('button', { name: 'บันทึก' }).click()
      await owner.getByText('ไข่มุก').first().waitFor()
      await owner.getByText('+10.00').first().waitFor()
    })

    await check('the owner offers the group on a product from the product form', async () => {
      await owner.goto(`${WEB}/products`)
      const row = owner.getByRole('row', { name: /น้ำดื่ม 600 มล\./ })
      await row.getByRole('button', { name: /การทำงานอื่นของ น้ำดื่ม 600 มล\./ }).click()
      await owner.getByRole('menuitem', { name: 'แก้ไขสินค้า' }).click()
      const form = owner.getByRole('dialog')
      await form.getByRole('checkbox', { name: 'ท็อปปิง' }).click()
      await form.getByRole('button', { name: 'บันทึก' }).click()
      await owner.getByRole('dialog').waitFor({ state: 'detached' })
    })

    await check('selling a product with options asks for them, adds their price, and the receipt lists them', async () => {
      await owner.goto(WEB)
      await owner.getByRole('button', { name: /น้ำดื่ม 600 มล\./ }).first().click()
      const dialog = owner.getByRole('dialog')
      await dialog.getByRole('checkbox', { name: /ไข่มุก/ }).click()
      await dialog.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
      // The topping is listed under the product in the cart, and the line is 10.00 + 10.00.
      await owner.getByText('+10.00').first().waitFor()
      await owner.getByRole('button', { name: /^ชำระเงิน/ }).click()
      await owner.getByRole('button', { name: 'พอดี' }).click()
      await owner.getByRole('button', { name: 'ยืนยันการชำระ' }).click()
      await owner.getByRole('button', { name: 'ขายรายการต่อไป' }).waitFor()
      await owner.getByText('+ ไข่มุก').waitFor()
      await owner.getByRole('button', { name: 'ขายรายการต่อไป' }).click()
    })

    console.log('\nTables:')

    await check('the owner adds a table, drags it, and its place survives a reload', async () => {
      await owner.goto(`${WEB}/tables`)
      await owner.getByRole('button', { name: 'เพิ่มโต๊ะ' }).click()
      await owner.getByRole('dialog').getByLabel('ชื่อโต๊ะ').fill('A1')
      await owner.getByRole('dialog').getByRole('button', { name: 'บันทึก' }).click()
      const table = owner.getByRole('button', { name: 'A1' })
      await table.waitFor()

      const box = (await table.boundingBox())!
      await owner.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await owner.mouse.down()
      await owner.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 120, { steps: 8 })
      await owner.mouse.up()

      await owner.reload()
      const moved = (await owner.getByRole('button', { name: 'A1' }).boundingBox())!
      if (moved.x < box.x + 100 || moved.y < box.y + 60) throw new Error('The table did not keep its new place')
    })

    await check('the cashier opens an order on the table, splits it, and the floor shows two orders', async () => {
      await cashier.goto(WEB)
      await cashier.getByRole('button', { name: 'โต๊ะ', exact: true }).click()
      await cashier.getByRole('dialog').getByRole('button', { name: 'A1' }).click()
      await cashier.getByRole('button', { name: /เปิดออเดอร์ใหม่ที่ A1/ }).click()

      // The product has an optional option group, so it asks before it goes on the order.
      for (let time = 0; time < 2; time++) {
        await cashier.getByRole('button', { name: /น้ำดื่ม 600 มล\./ }).first().click()
        await cashier.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
      }

      await cashier.getByRole('button', { name: 'แยกบิล', exact: true }).click()
      await cashier.getByRole('button', { name: /เพิ่มจำนวนที่แยก/ }).first().click()
      await cashier.getByRole('dialog').getByRole('button', { name: 'แยกบิล', exact: true }).click()

      await cashier.getByRole('button', { name: 'โต๊ะ', exact: true }).click()
      await cashier.getByText('2 ออเดอร์').first().waitFor()
    })

    await check('with the floor as home the cashier starts on the tables and carries an order to /sell', async () => {
      const changed = await owner.request.patch(`${WEB}/api/v1/settings`, { data: { homeView: 'tables' } })
      if (!changed.ok()) throw new Error(`Could not set the home screen: ${changed.status()}`)
      try {
        await cashier.goto(WEB)
        await cashier.getByRole('main').getByRole('button', { name: 'A1' }).click()
        await cashier.getByRole('button', { name: 'ทำต่อ', exact: true }).first().click()
        await cashier.waitForURL(`${WEB}/sell`)
        await cashier.getByRole('button', { name: 'แยกบิล', exact: true }).waitFor()
      } finally {
        await owner.request.patch(`${WEB}/api/v1/settings`, { data: { homeView: 'till' } })
      }
    })

    await check('a reload keeps the shift: the till is still ready to sell', async () => {
      await cashier.reload()
      await cashier.getByRole('button', { name: 'กะเปิดอยู่' }).waitFor()
    })

    await check('the shift page shows the cash sales in the drawer entries', async () => {
      await owner.goto(`${WEB}/shifts`)
      await owner.getByText('รับเงินสดจากการขาย').nth(2).waitFor()
    })

    await check('the owner starts counting: the report is frozen and shows what the drawer should hold', async () => {
      await owner.getByRole('button', { name: 'เริ่มนับปิดกะ' }).click()
      await owner.getByText(/ยอดที่หยุดไว้ตอนเริ่มนับ/).waitFor()
      // 100.00 opening + four sales of 10.00 (one of them on a phone) + one of 20.00 (10.00 and a 10.00 topping).
      await owner.getByText('เงินสดที่ควรมี').first().waitFor()
      await owner.getByText('฿160.00').first().waitFor()
    })

    await check('the other till can no longer take payment once counting has started', async () => {
      await cashier.goto(WEB)
      await cashier.getByRole('button', { name: 'เปิดกะก่อนขาย' }).waitFor({ timeout: 20_000 })
      await cashier.getByRole('button', { name: /น้ำดื่ม 600 มล\./ }).first().click()
      // The product now has an optional option group, so it asks before it goes in the cart.
      await cashier.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
      if (!(await cashier.getByRole('button', { name: /^ชำระเงิน/ }).isDisabled()))
        throw new Error('The pay button is enabled while the shift is being counted')
    })

    await check('a count that differs needs a reason before the shift can be closed', async () => {
      await owner.getByLabel('เงินสดที่นับได้').fill('135')
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
      await owner.getByText('-฿25.00').waitFor()
      await owner.getByText(/ยอดที่หยุดไว้ตอนเริ่มนับ/).waitFor()
    })

    console.log('\nOwner pages:')

    await check('the owner adds a user on the users page, and that person can sign in', async () => {
      await owner.goto(`${WEB}/users`)
      await owner.getByRole('button', { name: 'เพิ่มผู้ใช้' }).click()
      const form = owner.getByRole('dialog')
      await form.getByLabel('ชื่อผู้ใช้').fill('somsri')
      await form.getByLabel('ชื่อที่แสดงบนใบเสร็จ').fill('สมศรี')
      await form.getByLabel('รหัสผ่าน').fill(CASHIER_PASSWORD)
      await form.getByRole('button', { name: 'บันทึก' }).click()
      await owner.getByRole('row', { name: /somsri/ }).waitFor()
      const somsri = await signIn(browser, 'somsri', CASHIER_PASSWORD)
      await somsri.context().close()
    })

    await check('a cashier has no users or categories page', async () => {
      await cashier.goto(`${WEB}/users`)
      await cashier.getByRole('heading', { name: /ขายสินค้า/ }).waitFor()
      if ((await cashier.getByRole('link', { name: 'ผู้ใช้' }).count()) > 0) throw new Error('A cashier sees the users link')
      if ((await cashier.getByRole('link', { name: 'หมวดหมู่' }).count()) > 0) throw new Error('A cashier sees the categories link')
    })

    await check('the owner adds a category and then deactivates it', async () => {
      await owner.goto(`${WEB}/categories`)
      await owner.getByRole('button', { name: 'เพิ่มหมวดหมู่' }).click()
      const form = owner.getByRole('dialog')
      await form.getByLabel('ชื่อหมวดหมู่').fill('ของทดสอบ')
      await form.getByLabel('ลำดับการแสดง').fill('9')
      await form.getByRole('button', { name: 'บันทึก' }).click()
      const row = owner.getByRole('row', { name: /ของทดสอบ/ })
      await row.getByText('ใช้งานอยู่').waitFor()
      await row.getByRole('button', { name: /การทำงานอื่นของ ของทดสอบ/ }).click()
      await owner.getByRole('menuitem', { name: 'ปิดใช้งาน' }).click()
      await row.getByText('ปิดใช้งาน').waitFor()
    })

    await check('the owner uploads a product image from the product form, and the till shows it after a reload', async () => {
      await owner.goto(`${WEB}/products`)
      const row = owner.getByRole('row', { name: /น้ำดื่ม 600 มล\./ })
      await row.getByRole('button', { name: /การทำงานอื่นของ น้ำดื่ม 600 มล\./ }).click()
      await owner.getByRole('menuitem', { name: 'แก้ไขสินค้า' }).click()
      const form = owner.getByRole('dialog')
      // A 1x1 PNG: the smallest real image.
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
      await form.locator('input[type=file]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: png })
      await form.getByRole('button', { name: 'บันทึก' }).click()
      await form.waitFor({ state: 'detached' })

      await owner.goto(WEB)
      await owner.reload()
      const image = owner.locator('img[src^="/media/products/"]').first()
      await image.waitFor()
      const loaded = await image.evaluate((element) => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)
      if (!loaded) throw new Error('The product image did not load from /media')
    })

    console.log('\nScreens:')

    // Each check gets its own browser context and closes it, so the many page loads do not exhaust the browser's sockets.
    for (const size of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 900 }]) {
      await check(`no page scrolls sideways at ${size.width} px`, async () => {
        const screen = await signIn(browser, 'admin', OWNER_PASSWORD, size)
        try {
          const wide: string[] = []
          for (const path of ['/', '/sell', '/today', '/shifts', '/products', '/categories', '/modifiers', '/tables', '/branches', '/users', '/promotions', '/settings', '/roles', '/audit']) {
            await screen.goto(`${WEB}${path}`)
            await screen.waitForLoadState('networkidle')
            const overflow = await screen.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
            if (overflow > 0) wide.push(`${path} (+${overflow}px)`)
          }
          if (wide.length) throw new Error(`Pages wider than the screen at ${size.width} px: ${wide.join(', ')}`)
        } finally {
          await screen.context().close()
        }
      })
    }

    await check('every control in the main area of the sell screen is at least 44 px tall at 768 px', async () => {
      const screen = await signIn(browser, 'admin', OWNER_PASSWORD, { width: 768, height: 1024 })
      try {
        await screen.goto(WEB)
        await screen.waitForLoadState('networkidle')
        const small = await screen.evaluate(() =>
          [...document.querySelectorAll('main button, main input, main [role="tab"]')]
            .filter((element) => (element as HTMLElement).offsetParent !== null)
            .map((element) => ({
              name: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName,
              height: element.getBoundingClientRect().height,
            }))
            .filter((control) => control.height < 43.5)
            .map((control) => `${control.name} (${Math.round(control.height)}px)`),
        )
        if (small.length) throw new Error(`Too small to tap: ${small.join(', ')}`)
      } finally {
        await screen.context().close()
      }
    })

    await check('in English the same screens read in English', async () => {
      const changed = await owner.request.patch(`${WEB}/api/v1/settings`, { data: { locale: 'en' } })
      if (!changed.ok()) throw new Error(`Could not switch language: ${changed.status()}`)
      await owner.goto(`${WEB}/shifts`)
      await owner.waitForLoadState('networkidle')
      await owner.getByRole('button', { name: 'Open shift and start selling' }).waitFor()
      await owner.goto(WEB)
      await owner.waitForLoadState('networkidle')
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
