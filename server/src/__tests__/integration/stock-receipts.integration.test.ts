import { beforeEach, expect, test } from 'bun:test'
import { container } from 'tsyringe'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'
import { client as sql } from '../../libs/db'
import type { IAuditLog } from '../../modules/audit/applications/ports/audit-log.port'
import { GetStockReceiptUseCase } from '../../modules/stock-receipts/applications/usecases/get-stock-receipt.usecase'
import { ReceiveStockBatchUseCase } from '../../modules/stock-receipts/applications/usecases/receive-stock-batch.usecase'
let owner: Session
beforeEach(async () => { await resetDatabase(); owner = await signIn('owner') })
const headers = (key = crypto.randomUUID()) => ({ headers: { 'idempotency-key': key } })
const stock = async (id: number) => ok(await owner.api.catalog.products({ id }).get()).stockQty

test('normalizes rows, links movements and replays concurrent requests exactly once', async () => {
  const a = await seedProduct(owner, { sku: 'A' }); const b = await seedProduct(owner, { sku: 'B' })
  const key = crypto.randomUUID()
  const input = { items: [{ productId: b.id, quantity: 3 }, { productId: a.id, quantity: 2 }, { productId: b.id, quantity: 4 }], note: 'delivery' }
  const results = await Promise.all(Array.from({ length: 4 }, () => owner.api.inventory.receipts.post(input, headers(key))))
  const receipt = ok(results[0]!)
  for (const result of results) expect(ok(result)).toEqual(receipt)
  expect(receipt.items.map(i => [i.productId, i.quantity, i.balanceAfter])).toEqual([[a.id, 2, 2], [b.id, 7, 7]])
  // Eden decodes ISO timestamps to Date; the HTTP schema and stored command result are strings.
  expect(new Date(receipt.createdAt).toISOString()).toContain('T')
  expect(ok(await owner.api.inventory.receipts.post({ items: [{ productId: a.id, quantity: 2 }, { productId: b.id, quantity: 7 }], note: 'delivery' }, headers(key)))).toEqual(receipt)
  expect(await stock(a.id)).toBe(2); expect(await stock(b.id)).toBe(7)
  expect(await sql`select receipt_id from stock_movements`).toEqual([{ receipt_id: receipt.id }, { receipt_id: receipt.id }])
  expect(await sql`select count(*)::int as count from audit_logs where action = 'stock.receive_batch'`).toEqual([{ count: 1 }])
  const conflict = await owner.api.inventory.receipts.post({ items: [{ productId: a.id, quantity: 3 }] }, headers(key))
  expect(conflict.status).toBe(409); expect(conflict.error?.value).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
})
test('reports all invalid products and writes nothing', async () => {
  const good = await seedProduct(owner)
  const bad = await seedProduct(owner, { sku: 'NO-STOCK', trackStock: false })
  const result = await owner.api.inventory.receipts.post({ items: [{ productId: good.id, quantity: 2 }, { productId: bad.id, quantity: 1 }, { productId: 99999, quantity: 1 }] }, headers())
  expect(result.status).toBe(400)
  expect(result.error?.value).toMatchObject({ code: 'STOCK_RECEIPT_INVALID_ITEMS', params: { productIds: `${bad.id},99999` } })
  expect(await stock(good.id)).toBe(0)
  expect(ok(await owner.api.inventory.receipts.get()).total).toBe(0)
  expect(await sql`select count(*)::int as count from command_receipts`).toEqual([{ count: 0 }])
})
test('audit failure rolls back the entire receipt transaction', async () => {
  const product = await seedProduct(owner)
  const audit = (container.resolve(ReceiveStockBatchUseCase) as unknown as { audit: IAuditLog }).audit; const record = audit.record
  audit.record = async () => { throw new Error('audit unavailable') }
  try { expect((await owner.api.inventory.receipts.post({ items: [{ productId: product.id, quantity: 2 }] }, headers())).status).toBe(500) }
  finally { audit.record = record }
  expect(await stock(product.id)).toBe(0)
  for (const table of ['stock_receipts', 'stock_receipt_items', 'stock_movements', 'command_receipts'])
    expect(await sql.unsafe(`select count(*)::int as count from ${table}`)).toEqual([{ count: 0 }])
})
test('snapshots remain immutable, pagination counts all matches and reads are branch-scoped', async () => {
  const product = await seedProduct(owner)
  const old = ok(await owner.api.inventory.receipts.post({ items: [{ productId: product.id, quantity: 2 }] }, headers()))
  await sql`update products set name = 'changed', sku = 'changed' where id = ${product.id}`
  await sql`update users set display_name = 'changed' where id = ${owner.user.id}`
  expect(ok(await owner.api.inventory.receipts({ id: old.id }).get())).toEqual(old)
  const newer = ok(await owner.api.inventory.receipts.post({ items: [{ productId: product.id, quantity: 1 }] }, headers()))
  expect(ok(await owner.api.inventory.receipts.get({ query: { limit: 1, offset: 1 } }))).toEqual({ total: 2, items: [old] })
  expect(ok(await owner.api.inventory.receipts.get({ query: { limit: 1 } })).items[0]?.id).toBe(newer.id)
  expect(container.resolve(GetStockReceiptUseCase).execute({ id: old.id }, 999)).rejects.toMatchObject({ code: 'STOCK_RECEIPT_NOT_FOUND' })
})
test('permission rejects receipt writes and reads', async () => {
  const cashier = await signIn('cashier')
  expect((await cashier.api.inventory.receipts.get()).status).toBe(403)
  expect((await cashier.api.inventory.receipts({ id: 1 }).get()).status).toBe(403)
  expect((await cashier.api.inventory.receipts.post({ items: [{ productId: 1, quantity: 1 }] }, headers())).status).toBe(403)
})
test('overflow is rejected and the legacy movement HTTP shape is preserved', async () => {
  const product = await seedProduct(owner)
  const legacy = ok(await owner.api.inventory.receive.post({ productId: product.id, quantity: 2147483647 }))
  expect(legacy).not.toHaveProperty('receiptId')
  expect((await owner.api.inventory.receipts.post({ items: [{ productId: product.id, quantity: 1 }] }, headers())).status).toBe(400)
  expect(await stock(product.id)).toBe(2147483647)
})
test('different concurrent keys serialize stock changes without losing units', async () => {
  const product = await seedProduct(owner)
  const results = await Promise.all(Array.from({ length: 5 }, () => owner.api.inventory.receipts.post({ items: [{ productId: product.id, quantity: 3 }] }, headers())))
  expect(new Set(results.map(result => ok(result).id)).size).toBe(5)
  expect(await stock(product.id)).toBe(15)
  expect(results.map(result => ok(result).items[0]!.balanceAfter).sort((a, b) => a - b)).toEqual([3, 6, 9, 12, 15])
})
test('replay survives stock tracking disabled after the original success', async () => {
  const product = await seedProduct(owner); const key = crypto.randomUUID()
  const payload = { items: [{ productId: product.id, quantity: 2 }] }
  const receipt = ok(await owner.api.inventory.receipts.post(payload, headers(key)))
  await sql`update products set track_stock = false where id = ${product.id}`
  expect(ok(await owner.api.inventory.receipts.post(payload, headers(key)))).toEqual(receipt)
})
test('fractional pagination is rejected and missing receipt is a domain 404', async () => {
  expect((await owner.api.inventory.receipts.get({ query: { limit: 1.5 } })).status).toBe(422)
  expect((await owner.api.inventory.receipts.get({ query: { offset: 0.5 } })).status).toBe(422)
  const missing = await owner.api.inventory.receipts({ id: 9999 }).get()
  expect(missing.status).toBe(404)
  expect(missing.error?.value).toMatchObject({ code: 'STOCK_RECEIPT_NOT_FOUND' })
})
