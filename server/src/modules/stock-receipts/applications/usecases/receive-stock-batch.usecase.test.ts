import { beforeEach, expect, test } from 'bun:test'
import { makeProduct, makeStockMovement } from '../../../../__tests__/factories'
import { mockAuditLog, mockProductRepository, mockStockLedger, mockStockReceiptRepository, mockUnitOfWork } from '../../../../__tests__/mocks'
import { CommandIdempotency } from '../../../shared/applications/command-idempotency'
import { ReceiveStockBatchUseCase } from './receive-stock-batch.usecase'

const actor = { id: 1, displayName: 'Owner', role: 'owner' as const }
const key = '550e8400-e29b-41d4-a716-446655440000'
let products: ReturnType<typeof mockProductRepository>
let receipts: ReturnType<typeof mockStockReceiptRepository>
let ledger: ReturnType<typeof mockStockLedger>
let audit: ReturnType<typeof mockAuditLog>
let command: ReceiveStockBatchUseCase
beforeEach(() => {
  products = mockProductRepository(); receipts = mockStockReceiptRepository(); ledger = mockStockLedger(); audit = mockAuditLog()
  products.findManyForUpdate.mockResolvedValue([makeProduct()])
  ledger.record.mockResolvedValue(makeStockMovement({ balanceAfter: 12 }))
  receipts.create.mockImplementation(async value => ({ ...value, id: 1, createdAt: new Date(0).toISOString(), items: [] }))
  receipts.appendItems.mockImplementation(async (_id, items) => {})
  command = new ReceiveStockBatchUseCase(products, ledger, receipts, mockUnitOfWork(), audit,
    new CommandIdempotency({ lock: async () => {}, find: async () => null, create: async () => {} }))
})
test('receives normalized rows and snapshots the original catalogue and actor', async () => {
  const result = await command.execute({ items: [{ productId: 1, quantity: 1 }, { productId: 1, quantity: 1 }] }, actor, 1, key)
  expect(result).toMatchObject({ receivedByName: 'Owner', items: [{ sku: 'SKU-1', name: 'น้ำดื่ม', quantity: 2, balanceAfter: 12 }] })
  expect(ledger.record).toHaveBeenCalledTimes(1)
})
test('reports every unknown or untracked product before changing stock', async () => {
  products.findManyForUpdate.mockResolvedValue([makeProduct({ id: 2, trackStock: false })])
  expect(command.execute({ items: [{ productId: 1, quantity: 1 }, { productId: 2, quantity: 1 }] }, actor, 1, key))
    .rejects.toMatchObject({ code: 'STOCK_RECEIPT_INVALID_ITEMS', params: { productIds: '1,2' } })
  expect(ledger.record).not.toHaveBeenCalled()
})
test('rejects a balance overflowing PostgreSQL integer', async () => {
  products.findManyForUpdate.mockResolvedValue([makeProduct({ stockQty: 2147483647 })])
  expect(command.execute({ items: [{ productId: 1, quantity: 1 }] }, actor, 1, key)).rejects.toMatchObject({ code: 'STOCK_RECEIPT_INVALID_ITEMS' })
})
test('checks permission even for a direct command caller', async () => {
  expect(command.execute({ items: [{ productId: 1, quantity: 1 }] }, { ...actor, role: 'cashier' }, 1, key)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
})
test.each([
  { items: [] },
  { items: Array.from({ length: 101 }, () => ({ productId: 1, quantity: 1 })) },
  { items: [{ productId: 1, quantity: 0 }] },
  { items: [{ productId: 1, quantity: 1.5 }] },
])('rejects invalid row input %j', async ({ items }) => {
  expect(command.execute({ items }, actor, 1, key)).rejects.toBeDefined()
})
test('rejects oversized notes without writing a receipt', async () => {
  expect(command.execute({ items: [{ productId: 1, quantity: 1 }], note: 'x'.repeat(501) }, actor, 1, key)).rejects.toBeDefined()
  expect(receipts.create).not.toHaveBeenCalled()
})
test('rejects an invalid idempotency key without changing stock', async () => {
  expect(command.execute({ items: [{ productId: 1, quantity: 1 }] }, actor, 1, 'invalid')).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' })
  expect(ledger.record).not.toHaveBeenCalled()
})
test('receives inactive products when stock tracking is enabled', async () => {
  products.findManyForUpdate.mockResolvedValue([makeProduct({ isActive: false })])
  expect((await command.execute({ items: [{ productId: 1, quantity: 2 }] }, actor, 1, key)).items[0]?.quantity).toBe(2)
})
