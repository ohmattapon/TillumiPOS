// Receipt retry and reload checks on a private database; never reads the shop .env.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { SQL } from 'bun'
import { chromium, type BrowserContext, type Page } from 'playwright-core'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const DATABASE = 'pos_e2e_stock_receipts'
const API_PORT = 3390
const WEB_PORT = 5490
const WEB = `http://localhost:${WEB_PORT}`
const PASSWORD = 'receipt-browser-test-password'
const env = {
  ...process.env, PORT: String(API_PORT), DATABASE_URL: `postgres://pos:pos@localhost:5433/${DATABASE}`,
  JWT_SECRET: 'receipt-browser-test-secret-receipt', MEDIA_STORAGE: 'none',
  COOKIE_SECURE: 'false', CHECKOUT_MODE: 'legacy', SEED_OWNER_PASSWORD: PASSWORD,
  SCB_API_KEY: '', SCB_API_SECRET: '', SCB_BILLER_ID: '', SCB_REF3_PREFIX: '',
}
const children: ReturnType<typeof Bun.spawn>[] = []
const sizes = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'phone-short', width: 390, height: 500 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1366, height: 900 },
]

async function run(args: string[]) {
  const child = Bun.spawn(['bun', ...args], { cwd: join(root, 'server'), env, stdout: 'ignore', stderr: 'inherit' })
  assert.equal(await child.exited, 0, args.join(' '))
}

async function ready(url: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return } catch {}
    await Bun.sleep(300)
  }
  throw new Error(`Server did not start: ${url}`)
}

async function login(context: BrowserContext, username = 'admin') {
  const response = await context.request.post(`${WEB}/api/v1/auth/login`, { data: { username, password: PASSWORD } })
  assert.equal(response.status(), 200, 'sign in browser context')
}

async function screenshots(page: Page, kind: string) {
  for (const size of sizes) {
    await page.setViewportSize(size)
    await page.waitForTimeout(150)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${kind}/${size.name} must fit`)
    await page.screenshot({ path: join(root, 'screenshots', `stock-receipts-${size.name}-${kind}.png`), animations: 'disabled' })
    if (kind === 'draft') {
      await page.getByRole('button', { name: 'บันทึกรับเข้า', exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: join(root, 'screenshots', `stock-receipts-${size.name}-${kind}-bottom.png`), animations: 'disabled' })
      await page.getByRole('textbox', { name: 'ค้นหาสินค้า', exact: true }).scrollIntoViewIfNeeded()
    }
  }
  await page.setViewportSize({ width: 1366, height: 900 })
}

async function main() {
  const admin = new SQL('postgres://pos:pos@localhost:5433/postgres')
  try {
    await admin.unsafe(`drop database if exists "${DATABASE}" with (force)`)
    await admin.unsafe(`create database "${DATABASE}"`)
  } finally { await admin.close() }
  await run(['src/infrastructure/database/migrate.ts'])
  await run(['src/infrastructure/database/seed.ts'])
  children.push(Bun.spawn(['bun', 'src/index.ts'], { cwd: join(root, 'server'), env, stdout: 'ignore', stderr: 'inherit' }))
  children.push(Bun.spawn(['bun', 'x', 'vite', '--port', String(WEB_PORT), '--strictPort'], {
    cwd: root, env: { ...process.env, API_TARGET: `http://localhost:${API_PORT}` }, stdout: 'ignore', stderr: 'inherit',
  }))
  await ready(`http://localhost:${API_PORT}/api/v1/health`)
  await ready(WEB)
  await mkdir(join(root, 'screenshots'), { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'th-TH' })
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    await login(context)
    const productNames = ['รับเข้า ทดสอบ A', 'รับเข้า ทดสอบ B']
    const products: { id: number; name: string }[] = []
    for (const [index, name] of productNames.entries()) {
      const response = await context.request.post(`${WEB}/api/v1/catalog/products`, {
        data: { sku: `RECEIPT-TEST-${index}`, name, priceSatang: 1000 },
      })
      assert(response.ok(), 'create receipt fixture product')
      products.push(await response.json())
    }
    await page.goto(`${WEB}/stock-receipts/new`)
    const search = page.getByRole('textbox', { name: 'ค้นหาสินค้า', exact: true })
    await search.waitFor()
    for (const [index, product] of products.entries()) {
      await search.fill(product.name)
      await page.getByRole('button', { name: `เพิ่ม ${product.name}`, exact: true }).and(page.locator(':visible')).click()
      await page.getByLabel(`จำนวนรับเข้า ${product.name}`, { exact: true }).and(page.locator(':visible')).fill(String(index + 3))
    }
    await page.setViewportSize({ width: 390, height: 844 })
    const quantity = page.getByLabel(`จำนวนรับเข้า ${products[0]!.name}`, { exact: true }).and(page.locator(':visible'))
    await quantity.fill('')
    assert.equal(await quantity.inputValue(), '', 'quantity can be cleared while replacing its value')
    assert(await page.getByRole('button', { name: 'บันทึกรับเข้า', exact: true }).isDisabled(), 'do not submit a stale quantity while the input is empty')
    await quantity.fill('3')
    await page.setViewportSize({ width: 1366, height: 900 })
    await search.fill('')
    await page.getByLabel('หมายเหตุ', { exact: true }).fill('receipt-reload-and-retry')
    await page.reload()
    for (const [index, product] of products.entries()) {
      assert.equal(await page.getByLabel(`จำนวนรับเข้า ${product.name}`, { exact: true }).and(page.locator(':visible')).inputValue(), String(index + 3))
    }
    assert.equal(await page.getByLabel('หมายเหตุ', { exact: true }).inputValue(), 'receipt-reload-and-retry')
    await screenshots(page, 'draft')

    const posts: { key: string; body: unknown }[] = []
    let receiptId = 0
    const endpoint = /\/api\/v1\/inventory\/receipts\/?$/
    await page.route(endpoint, async route => {
      const request = route.request()
      if (request.method() !== 'POST') return route.continue()
      posts.push({ key: request.headers()['idempotency-key'] ?? '', body: request.postDataJSON() })
      const response = await route.fetch()
      assert.equal(response.status(), 200, 'first request commits on server')
      receiptId = (await response.json() as { id: number }).id
      // Lose the response AFTER commit, reproducing the ambiguous network outcome.
      await route.abort('failed')
    })
    await page.getByRole('button', { name: 'บันทึกรับเข้า', exact: true }).click()
    const retry = page.getByRole('button', { name: 'ตรวจสอบและส่งซ้ำ', exact: true })
    await retry.waitFor()
    assert(receiptId > 0)
    for (const [index, product] of products.entries()) {
      const response = await context.request.get(`${WEB}/api/v1/catalog/products/${product.id}`)
      assert.equal((await response.json()).stockQty, index + 3)
    }
    await page.reload()
    await retry.waitFor()
    await screenshots(page, 'uncertain')
    await page.unroute(endpoint)
    page.on('request', request => {
      if (request.method() === 'POST' && endpoint.test(request.url()))
        posts.push({ key: request.headers()['idempotency-key'] ?? '', body: request.postDataJSON() })
    })
    await retry.click()
    await page.getByRole('button', { name: 'เริ่มใบรับใหม่', exact: true }).waitFor()
    assert.equal(posts.length, 2)
    assert.match(posts[0]!.key, /^[0-9a-f-]{36}$/i)
    assert.deepEqual(posts[1], posts[0], 'reload/retry preserves frozen body and key')
    const list = await context.request.get(`${WEB}/api/v1/inventory/receipts?limit=25&offset=0`)
    const receipts = await list.json()
    assert.equal(receipts.total, 1)
    assert.equal(receipts.items[0].id, receiptId)
    for (const [index, product] of products.entries()) {
      const response = await context.request.get(`${WEB}/api/v1/catalog/products/${product.id}`)
      assert.equal((await response.json()).stockQty, index + 3, 'retry must not add stock again')
      const history = await context.request.get(`${WEB}/api/v1/inventory/movements?productId=${product.id}`)
      assert.equal((await history.json()).total, 1, 'one movement per receipt item')
    }
    await screenshots(page, 'confirmed')
    await page.reload()
    await page.getByRole('button', { name: 'เริ่มใบรับใหม่', exact: true }).waitFor()
    assert.equal(posts.length, 2, 'confirmed reload must not submit automatically')
    await page.goto(`${WEB}/stock-receipts`)
    await page.getByText(`ใบรับเข้า #${receiptId}`, { exact: true }).and(page.locator(':visible')).first().waitFor()
    await page.getByText(`ใบรับเข้า #${receiptId}`, { exact: true }).and(page.locator(':visible')).first().click()
    await page.getByText('receipt-reload-and-retry').waitFor()
    await screenshots(page, 'history')

    // A confirmed receipt must be explicitly replaced; actor drafts must never mix.
    await page.goto(`${WEB}/stock-receipts/new`)
    await page.getByRole('button', { name: 'เริ่มใบรับใหม่', exact: true }).click()
    await page.getByLabel('หมายเหตุ', { exact: true }).fill('admin-private-draft')
    const user = await context.request.post(`${WEB}/api/v1/users`, {
      data: { username: 'receipt-other-owner', displayName: 'Receipt other owner', password: PASSWORD, role: 'owner' },
    })
    assert(user.ok(), 'create actor isolation fixture')
    await login(context, 'receipt-other-owner')
    await page.reload()
    assert.equal(await page.getByLabel('หมายเหตุ', { exact: true }).inputValue(), '', 'another actor gets an independent draft')
    await page.getByLabel('หมายเหตุ', { exact: true }).fill('other-private-draft')
    await login(context)
    await page.reload()
    assert.equal(await page.getByLabel('หมายเหตุ', { exact: true }).inputValue(), 'admin-private-draft', 'returning actor recovers own draft')
    console.log('PASS: multi-item receiving, quantity editing, immediate editing reload, committed-response loss, reload/retry with same key/body, one receipt/movement/stock increment, confirmed reload, history detail, actor-isolated drafts and four responsive viewports')
    await context.close()
  } finally { await browser.close() }
}

try { await main() } catch (error) { console.error(error); process.exitCode = 1 } finally {
  for (const child of children) {
    if (process.platform === 'win32') Bun.spawnSync(['taskkill', '/F', '/T', '/PID', String(child.pid)], { stdout: 'ignore', stderr: 'ignore' })
    else child.kill()
  }
}
