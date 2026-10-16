// Screenshots of every page at phone, small-phone and tablet/desktop sizes, to check a screen by eye before merging.
//
//   bun run screenshots                   (writes to screenshots/ at the repo root, git-ignored)
//   bun run screenshots <folder>          (another folder)
//   SHOTS_ONLY=phone,phone-short bun run screenshots   (a subset of sizes)
//
// Uses its own database (pos_e2e_shots), its own API and web server on spare ports, and never the development database.
import { SQL } from 'bun'
import assert from 'node:assert/strict'
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
      const shot = async (name: string) => {
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${size.name}/${name}: horizontal overflow`)
        await page.screenshot({ path: join(OUT, `${size.name}-${name}.png`), animations: 'disabled' })
      }

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
      if (size.width < 1024) {
        await page.getByRole('button', { name: /4 ชิ้น/ }).click()
        const close = page.getByRole('button', { name: 'ปิดตะกร้า', exact: true })
        const bounds = await close.boundingBox()
        assert(bounds && bounds.width >= 44 && bounds.height >= 44, 'cart close target must be at least 44px')
        await shot('02a-cart-sheet')
        await close.click()
        await page.getByRole('dialog').waitFor({ state: 'hidden' })
      }
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
        ['22-reports', '/reports'],
        ['23-promotions', '/promotions'],
        ['24-roles', '/roles'], ['25-audit', '/audit'],
      ] as const) {
        await page.goto(`${WEB}${path}`)
        await page.waitForTimeout(1000)
        await shot(name)
      }
      await shootCustomerDisplay(context, size.name)
      await page.goto(`${WEB}/roles`)
      await page.getByRole('button', { name: 'เพิ่มบทบาท', exact: true }).click()
      await page.getByRole('dialog').waitFor()
      await shot('26-role-form')
      await page.keyboard.press('Escape')

      // The floor as the home screen (the seed may have no tables, which shows the empty floor).
      assert((await page.request.patch(`${WEB}/api/v1/settings`, { data: { homeView: 'tables' } })).ok())
      await page.goto(WEB)
      await page.waitForTimeout(1000)
      await shot('27-floor-home')
      assert((await page.request.patch(`${WEB}/api/v1/settings`, { data: { homeView: 'till' } })).ok())

      // Date-only values survive the shadcn calendar without UTC conversion or premature submission.
      await page.goto(`${WEB}/reports?from=2024-02-01&to=2024-02-29&scope=branch`)
      const from = page.getByRole('button', { name: 'ตั้งแต่วันที่', exact: true })
      const apply = page.getByRole('button', { name: 'แสดงรายงาน', exact: true })
      await from.waitFor()
      assert((await from.textContent())?.includes('2567'))
      assert.equal(await page.locator('input[type="date"]').count(), 0)
      await from.click()
      const picker = page.getByRole('dialog', { name: 'ตั้งแต่วันที่', exact: true })
      await picker.waitFor()
      assert.equal(await picker.getByRole('combobox', { name: 'เลือกปี' }).inputValue(), '2024')
      const leapDay = picker.getByRole('button', { name: '29 ก.พ. 2567', exact: true })
      await shot('23-report-calendar')
      const target = await leapDay.boundingBox()
      assert(target && target.width >= 44 && target.height >= 44, `calendar days need 44px targets: ${JSON.stringify(target)}`)
      await leapDay.click()
      await picker.waitFor({ state: 'hidden' })
      assert.equal(new URL(page.url()).searchParams.get('from'), '2024-02-01', 'choosing a day must not submit the form')
      await apply.click()
      await page.waitForURL('**/reports?from=2024-02-29&to=2024-02-29&scope=branch')

      const to = page.getByRole('button', { name: 'ถึงวันที่', exact: true })
      await to.click()
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Enter')
      await page.getByRole('dialog', { name: 'ถึงวันที่', exact: true }).waitFor({ state: 'hidden' })
      assert((await to.textContent())?.includes('1 มี.ค. 2567'))
      await apply.click()
      await page.waitForURL('**/reports?from=2024-02-29&to=2024-03-01&scope=branch')

      // Keyboard opening and Escape restore focus to the trigger.
      await from.focus()
      await from.press('Enter')
      await picker.waitFor()
      await page.keyboard.press('Escape')
      await picker.waitFor({ state: 'hidden' })
      assert(await from.evaluate((button) => document.activeElement === button))

      // An inverted range is still rejected; the existing preset restores a valid range.
      await from.click()
      await picker.getByRole('combobox', { name: 'เลือกเดือน' }).selectOption('2')
      await picker.getByRole('button', { name: '10 มี.ค. 2567', exact: true }).click()
      assert(await apply.isDisabled())
      await page.getByRole('alert').filter({ hasText: 'เลือกช่วงวัน' }).waitFor()
      await shot('24-report-invalid-range')
      await page.getByRole('button', { name: 'วันนี้', exact: true }).click()
      await page.waitForURL((url) => url.searchParams.get('from') === url.searchParams.get('to'))
      await apply.click({ trial: true })
      assert(await apply.isEnabled())

      // Switch only this isolated fixture's locale; Gregorian request values stay unchanged.
      assert((await page.request.patch(`${WEB}/api/v1/settings`, { data: { locale: 'en' } })).ok())
      await page.goto(`${WEB}/reports?from=2024-02-01&to=2024-02-29&scope=branch`)
      const englishFrom = page.getByRole('button', { name: 'From', exact: true })
      await englishFrom.waitFor()
      assert((await englishFrom.textContent())?.includes('Feb 1, 2024'))
      await englishFrom.click()
      const englishPicker = page.getByRole('dialog', { name: 'From', exact: true })
      assert.equal(await englishPicker.getByRole('combobox', { name: 'Choose year' }).inputValue(), '2024')
      await shot('25-report-calendar-en')
      await englishPicker.getByRole('button', { name: 'Feb 29, 2024', exact: true }).click()
      await page.getByRole('button', { name: 'View report', exact: true }).click()
      await page.waitForURL('**/reports?from=2024-02-29&to=2024-02-29&scope=branch')
      assert((await page.request.patch(`${WEB}/api/v1/settings`, { data: { locale: 'th' } })).ok())

      for (const theme of ['dark', 'midnight', 'forest', 'rose']) {
        await page.evaluate((value) => localStorage.setItem('pos.theme', value), theme)
        await page.reload()
        await from.click()
        await shot(`26-report-calendar-${theme}`)
        const bounds = await picker.boundingBox()
        assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= size.width && bounds.y + bounds.height <= size.height, 'calendar must fit within the viewport')
        await page.keyboard.press('Escape')
      }
      await page.evaluate(() => localStorage.setItem('pos.theme', 'light'))

      // A failed first read must not look like zero sales or keep totals loading forever.
      const salesReads = /\/api\/v1\/sales(?:\/summary)?\?/
      const failure = 'ทดสอบการเชื่อมต่อขัดข้อง'
      await page.route(salesReads, (route) => route.fulfill({
        status: 503, contentType: 'application/problem+json',
        body: JSON.stringify({ type: 'about:blank', title: 'Unavailable', status: 503, detail: failure, code: 'GUI_TEST_UNAVAILABLE' }),
      }))
      await page.goto(`${WEB}/today`)
      const totals = page.getByRole('region', { name: 'สรุปยอดขายวันนี้' })
      await totals.getByRole('alert').waitFor()
      await page.getByText(failure, { exact: true }).nth(1).waitFor()
      assert.equal(await page.getByText('วันนี้ยังไม่มีบิลขาย', { exact: true }).count(), 0)
      assert.equal(await totals.locator('[aria-busy="true"]').count(), 0)
      await shot('20-today-error')

      // Retry both failed sections against the real isolated API, without a page reload.
      await page.unroute(salesReads)
      await totals.getByRole('button', { name: 'ลองใหม่' }).click()
      await totals.getByRole('alert').waitFor({ state: 'hidden' })
      await page.getByRole('alert').getByRole('button', { name: 'ลองใหม่' }).click()
      await page.getByRole('alert').waitFor({ state: 'hidden' })
      await page.getByText('วันนี้ยังไม่มีบิลขาย', { exact: true }).and(page.locator(':visible')).waitFor()
      await shot('21-today-recovered')
      await memberScreens(page, size, shot, size.name === chosen.at(-1)?.name)
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
      const envelope = { v: 1, sessionId: 'shots', seq, at: Date.now(), locale: 'th', currency: 'THB', shopName: 'TillumiPOS', state: value }
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

/** Member screens use the same isolated database and authenticated UI as the rest of this suite. */
async function memberScreens(page: Page, size: typeof sizes[number], shot: (name: string) => Promise<void>, lifecycle: boolean) {
  assert((await page.request.patch(`${WEB}/api/v1/settings`, { data: { locale: 'en' } })).ok())
  await page.goto(`${WEB}/members`)
  await page.getByRole('heading', { name: 'Members', exact: true }).waitFor()
  const name = `Browser member ${size.name}`
  const phone = `081234${String(sizes.indexOf(size)).padStart(4, '0')}`
  await page.getByRole('button', { name: 'Add member', exact: true }).click()
  await page.getByLabel('Member name', { exact: true }).fill(name)
  await page.getByLabel('Phone number', { exact: true }).fill(phone)
  await shot('30-member-create')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.getByRole('textbox', { name: 'Search name, phone or member code' }).fill(phone)
  await page.getByText(name, { exact: true }).and(page.locator(':visible')).waitFor()
  await shot('31-member-directory')
  await page.getByText(name, { exact: true }).and(page.locator(':visible')).click()
  await page.getByRole('heading', { name: 'Purchase history' }).waitFor()
  const memberId = Number(new URL(page.url()).pathname.split('/').at(-1))
  await shot('32-member-history')
  await page.getByRole('button', { name: 'Edit member', exact: true }).click()
  await page.getByLabel('Member name', { exact: true }).fill(`${name} edited`)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  const selectMember = async () => {
    await page.getByRole('button', { name: 'Walk-in customer', exact: true }).and(page.locator(':visible')).click()
    await page.getByRole('textbox', { name: 'Search name, phone or member code' }).fill(phone)
    await page.getByRole('button', { name: new RegExp(`${name} edited`) }).click()
  }
  const openBasket = async () => {
    if (size.width < 1024) await page.getByRole('button', { name: /items/ }).and(page.locator(':visible')).click()
  }
  await page.goto(WEB)
  // A full navigation deliberately creates a fresh cart; add one item through the real picker.
  await tryClick(page, page.getByRole('button', { name: /[$]| \d+\.\d\d/ }).first())
  await openBasket()
  await selectMember()
  await page.getByRole('button', { name: `${name} edited`, exact: true }).and(page.locator(':visible')).waitFor()
  await shot('33-member-pos')
  await page.getByRole('button', { name: 'Remove', exact: true }).and(page.locator(':visible')).click()
  await page.getByRole('button', { name: 'Walk-in customer', exact: true }).and(page.locator(':visible')).waitFor()
  if (size.width < 1024) await page.getByRole('button', { name: 'Close cart', exact: true }).click()
  if (lifecycle) {
    await openBasket()
    await selectMember()
    await page.getByRole('button', { name: 'Save as open order', exact: true }).and(page.locator(':visible')).click()
    await page.getByLabel('Label', { exact: true }).fill('Member browser order')
    const opened = page.waitForResponse((response) => response.url().endsWith('/api/v1/orders') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Save order', exact: true }).click()
    const order = await (await opened).json()
    assert.equal(order.memberId, memberId, 'saved order carries selected membership')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    // Resume the order through the UI, then exercise the order membership command.
    await page.getByRole('button', { name: /^Open orders/ }).and(page.locator(':visible')).click()
    const orderRow = page.getByRole('listitem').filter({ hasText: 'Member browser order' })
    await orderRow.getByRole('button', { name: /Continue/ }).click()
    await openBasket()
    const removed = page.waitForResponse((response) => response.url().endsWith(`/orders/${order.id}/member`) && response.request().method() === 'PATCH')
    await page.getByRole('button', { name: 'Remove', exact: true }).and(page.locator(':visible')).click()
    assert.equal((await (await removed).json()).memberId, null)
    await selectMember()
    const paid = page.waitForResponse((response) => response.url().includes(`/orders/${order.id}/pay`) && response.request().method() === 'POST')
    await page.getByRole('button', { name: /^Pay/ }).and(page.locator(':visible')).click()
    await page.getByRole('button', { name: 'Exact', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm payment', exact: true }).click()
    const sale = await (await paid).json()
    assert.equal(sale.member.id, memberId)
    assert.equal(sale.member.phone, undefined)
    await page.getByText(`Members: ${sale.member.code} / ${sale.member.name}`, { exact: true }).waitFor()
    await shot('34-member-receipt')
    await page.getByRole('button', { name: 'Next sale', exact: true }).click()
    await page.goto(`${WEB}/members/${memberId}`)
    await page.getByText(sale.receiptNo, { exact: true }).and(page.locator(':visible')).waitFor()
    await shot('35-member-purchases')
    // Cashiers can create and inspect members, but owner-only management controls stay absent.
    const username = 'member_browser_cashier'
    assert((await page.request.post(`${WEB}/api/v1/users`, { data: { username, password: PASSWORD, displayName: 'Member cashier', role: 'cashier' } })).ok())
    await page.request.post(`${WEB}/api/v1/auth/logout`)
    await page.goto(WEB)
    await page.getByLabel('Username', { exact: true }).fill(username)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.goto(`${WEB}/members/${memberId}`)
    await page.getByRole('heading', { name: 'Purchase history' }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Edit member', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Deactivate', exact: true }).count(), 0)
    await shot('36-member-cashier')
  }
  // Keep the next viewport in Thai, as expected by the shared screenshots above.
  if (!lifecycle) assert((await page.request.patch(`${WEB}/api/v1/settings`, { data: { locale: 'th' } })).ok())
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
  process.exitCode = 1
} finally {
  for (const child of children) {
    if (process.platform === 'win32') Bun.spawnSync(['taskkill', '/F', '/T', '/PID', String(child.pid)], { stdout: 'ignore', stderr: 'ignore' })
    else child.kill()
  }
}
