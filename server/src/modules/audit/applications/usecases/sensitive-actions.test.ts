import 'reflect-metadata'
import { expect, test } from 'bun:test'
import { mock, spyOn } from 'bun:test'
import { makeProduct } from '../../../../__tests__/factories'
import { mockProductRepository, mockUnitOfWork, mockUserRepository, mockPasswordHasher, mockLoginAttemptGuard } from '../../../../__tests__/mocks'
import { CreateProductUseCase } from '../../../products/applications/usecases/create-product.usecase'
import { LoginUseCase } from '../../../auth/applications/usecases/login.usecase'
const actor = { id: 5, displayName: 'สมหญิง' }
const audit = () => ({ record: mock(async () => { }), list: mock(async () => ({ items: [], total: 0 })) })
test('product creation records the real actor within its transaction and audit failure rejects the command', async () => {
  let insideTransaction = false
  const products = mockProductRepository(), log = audit()
  const uow = { async run<T>(work: () => Promise<T>): Promise<T> {
    insideTransaction = true
    try { return await work() } finally { insideTransaction = false }
  } }
  log.record.mockImplementation(async () => { expect(insideTransaction).toBe(true) })
  products.create.mockResolvedValue(makeProduct({ id: 9 }))
  const command = new CreateProductUseCase(products, uow, log)
  await command.execute({ sku: 'A', name: 'สินค้า', priceSatang: 100 }, 1, actor)
  expect(log.record).toHaveBeenCalledWith({ id: 5, name: 'สมหญิง' }, 1, expect.objectContaining({ action: 'product.create', entityId: '9' }))
  log.record.mockRejectedValue(new Error('audit unavailable'))
  await expect(command.execute({ sku: 'A', name: 'สินค้า', priceSatang: 100 }, 1, actor)).rejects.toThrow('audit unavailable')
})
test('failed login records only the attempted username and audit failure preserves unauthorized', async () => {
  const users = mockUserRepository(), log = audit()
  users.findCredentialsByUsername.mockResolvedValue(null)
  const command = new LoginUseCase(users, mockPasswordHasher(), log, mockLoginAttemptGuard())
  await expect(command.execute({ username: 'someone', password: 'super-secret-password' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  expect(log.record).toHaveBeenCalledWith({ id: null, name: 'someone' }, null, expect.objectContaining({ action: 'auth.login_failed' }))
  expect(JSON.stringify(log.record.mock.calls)).not.toContain('super-secret-password')
  log.record.mockRejectedValue(new Error('audit unavailable'))
  const diagnostic = spyOn(console, 'error').mockImplementation(() => {})
  try {
    await expect(command.execute({ username: 'someone', password: 'super-secret-password' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(diagnostic).toHaveBeenCalledWith('audit: login_failed not recorded', expect.any(Error))
  } finally { diagnostic.mockRestore() }
})
import { makeBranch, makeQrPayment, makeSale, makeStockMovement, makeUser } from '../../../../__tests__/factories'
import { mockAuditLog, mockBranchRepository, mockClock, mockProductRepository as productRepo, mockQuoteClaims, mockQrPaymentRepository, mockRoleDirectory, mockRoleRepository, mockSaleRepository, mockShiftLedger, mockShiftSettingsGuard, mockShopSettingsRepository, mockStockLedger } from '../../../../__tests__/mocks'
import { UpdateProductUseCase } from '../../../products/applications/usecases/update-product.usecase'
import { ReceiveStockUseCase } from '../../../inventory/applications/usecases/receive-stock.usecase'
import { AdjustStockUseCase } from '../../../inventory/applications/usecases/adjust-stock.usecase'
import { VoidSaleUseCase } from '../../../sales/applications/usecases/void-sale.usecase'
import { DismissQrPaymentUseCase } from '../../../qr-payments/applications/usecases/dismiss-qr-payment.usecase'
import { CreateUserUseCase } from '../../../users/applications/usecases/create-user.usecase'
import { UpdateUserUseCase } from '../../../users/applications/usecases/update-user.usecase'
import { CreateRoleUseCase } from '../../../roles/applications/usecases/create-role.usecase'
import { UpdateRoleUseCase } from '../../../roles/applications/usecases/update-role.usecase'
import { DeleteRoleUseCase } from '../../../roles/applications/usecases/delete-role.usecase'
import { UpdateShopSettingsUseCase } from '../../../settings/applications/usecases/update-shop-settings.usecase'
import { RoleEntity } from '../../../../domains/role.domain'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
const owner = { ...actor, role: 'owner' as const }
const now = new Date('2026-10-16T06:00:00Z')

test('classification-only updates audit both types inside the unit of work and reject audit failure', async () => {
  const repo = productRepo()
  const log = mockAuditLog()
  let insideTransaction = false
  const uow = { async run<T>(work: () => Promise<T>): Promise<T> {
    insideTransaction = true
    try { return await work() } finally { insideTransaction = false }
  } }
  repo.findById.mockResolvedValue(makeProduct())
  repo.update.mockImplementation(async p => p)
  log.record.mockImplementation(async () => { expect(insideTransaction).toBe(true) })
  const command = new UpdateProductUseCase(repo, uow, log)
  await command.execute(1, { productType: 'cafe' }, 1, actor)
  const expected = { action: 'product.update', before: { productType: 'normal' }, after: { productType: 'cafe' } }
  expect(log.record.mock.calls[0]?.[2]).toMatchObject(expected)
  log.record.mockRejectedValue(new Error('audit unavailable'))
  await expect(command.execute(1, { productType: 'cafe' }, 1, actor)).rejects.toThrow('audit unavailable')
})

test('product update includes only changed allowed values, and no-op/rejected updates have no history', async () => {
  const repo = productRepo(), log = mockAuditLog()
  repo.findById.mockResolvedValue(makeProduct())
  repo.update.mockImplementation(async p => p)
  const command = new UpdateProductUseCase(repo, mockUnitOfWork(), log)
  await command.execute(1, { name: 'ใหม่' }, 1, actor)
  expect(log.record.mock.calls[0]?.[2]).toMatchObject({ action: 'product.update', before: { name: 'น้ำดื่ม' }, after: { name: 'ใหม่' } })
  log.record.mockClear()
  await command.execute(1, { name: 'น้ำดื่ม' }, 1, actor)
  expect(log.record).not.toHaveBeenCalled()
  repo.findById.mockResolvedValue(null)
  await expect(command.execute(1, { name: 'ใหม่' }, 1, actor)).rejects.toThrow()
  expect(log.record).not.toHaveBeenCalled()
})
for (const operation of ['receive', 'adjust'] as const) test(`stock.${operation} captures branch quantities; invalid input creates no audit`, async () => {
  const repo = productRepo(), ledger = mockStockLedger(), log = mockAuditLog()
  repo.findManyForUpdate.mockResolvedValue([makeProduct({ stockQty: 10 })])
  ledger.record.mockResolvedValue(makeStockMovement())
  const command = operation === 'receive' ? new ReceiveStockUseCase(repo, ledger, mockUnitOfWork(), log) : new AdjustStockUseCase(repo, ledger, mockUnitOfWork(), log)
  const input = operation === 'receive' ? { productId: 1, quantity: 4, note: 'ตรวจนับ' } : { productId: 1, countedQty: 4, note: 'ตรวจนับ' }
  await command.execute(input, actor, 7)
  expect(log.record.mock.calls[0]).toEqual([{ id: 5, name: 'สมหญิง' }, 7, expect.objectContaining({ action: `stock.${operation}`, before: { qty: 10 }, after: { qty: operation === 'receive' ? 14 : 4 }, reason: 'ตรวจนับ' })])
  log.record.mockClear()
  await expect(command.execute({ ...input, productId: 1.5 }, actor, 7)).rejects.toThrow()
  expect(log.record).not.toHaveBeenCalled()
})
test('void records actual operator and status after all stock returns, and rejects an already voided sale without logging', async () => {
  const repo = mockSaleRepository(), ledger = mockStockLedger(), log = mockAuditLog()
  repo.findByIdForUpdate.mockResolvedValue(makeSale({ id: 412 }))
  const command = new VoidSaleUseCase(repo, ledger, mockUnitOfWork(), mockClock(now), log)
  await command.execute(412, { reason: 'คิดเงินผิด' }, owner, 1)
  expect(log.record.mock.calls[0]).toEqual([{ id: 5, name: 'สมหญิง' }, 1, expect.objectContaining({ action: 'sale.void', entityId: '412', before: { status: 'completed' }, after: { status: 'voided' }, reason: 'คิดเงินผิด' })])
  repo.findByIdForUpdate.mockResolvedValue(makeSale({ status: 'voided', voidedAt: now, voidedById: 5, voidReason: 'ยกเลิก' })); log.record.mockClear()
  await expect(command.execute(412, { reason: 'ซ้ำ' }, owner, 1)).rejects.toThrow()
  expect(log.record).not.toHaveBeenCalled()
})
test('QR dismissal preserves paid status with a dismissal marker and reason; rejected dismissal is not audited', async () => {
  const repo = mockQrPaymentRepository(), log = mockAuditLog(), quotes = mockQuoteClaims()
  repo.findByIdForUpdate.mockResolvedValue(makeQrPayment({ status: 'paid', paidAt: now, bankTransactionId: 'BANK-1' }))
  repo.save.mockImplementation(async p => p)
  const command = new DismissQrPaymentUseCase(repo, mockUnitOfWork(), mockClock(now), quotes, log)
  await command.execute(1, { reason: 'คืนเงินที่ธนาคาร' }, owner, 1)
  expect(log.record.mock.calls[0]?.[2]).toMatchObject({ action: 'qr.dismiss', after: { status: 'paid', dismissed: true }, reason: 'คืนเงินที่ธนาคาร' })
  repo.findByIdForUpdate.mockResolvedValue(null); log.record.mockClear()
  await expect(command.execute(1, { reason: 'ไม่มี' }, owner, 1)).rejects.toThrow()
  expect(log.record).not.toHaveBeenCalled()
})
test('user creation resolves the role under a lock and records safe identity fields only', async () => {
  const repo = mockUserRepository(), branches = mockBranchRepository(), roles = mockRoleDirectory(), log = mockAuditLog()
  branches.findById.mockResolvedValue(makeBranch())
  roles.findById.mockResolvedValue({ id: 8, name: 'ผู้จัดการ', systemKey: null })
  repo.create.mockImplementation(async p => makeUser({ ...p.toSnapshot(), roleId: p.roleId, id: 8 }))
  await new CreateUserUseCase(repo, branches, mockPasswordHasher(), mockUnitOfWork(), roles, log).execute({ username: 'manager', displayName: 'ผู้จัดการ', password: 'private-password', roleId: 8 }, 1, actor)
  expect(roles.findByIdForUpdate).toHaveBeenCalledWith(8)
  expect(log.record.mock.calls[0]?.[2]).toMatchObject({ action: 'user.create', after: { displayName: 'ผู้จัดการ', roleId: 8, branchId: 1, isActive: true } })
  expect(JSON.stringify(log.record.mock.calls)).not.toContain('private-password')
})
test('password updates record only a boolean; unchanged public fields do not leak hash or password', async () => {
  const repo = mockUserRepository(), log = mockAuditLog()
  repo.findByIdForUpdate.mockResolvedValue(makeUser({ roleId: 2 }))
  repo.update.mockImplementation(async p => p)
  const command = new UpdateUserUseCase(repo, mockBranchRepository(), mockPasswordHasher(), mockUnitOfWork(), mockRoleDirectory(), log)
  await command.execute(1, { password: 'private-password' }, actor)
  expect(log.record.mock.calls[0]?.[2]).toMatchObject({ action: 'user.update', before: {}, after: { passwordChanged: true } })
  expect(JSON.stringify(log.record.mock.calls)).not.toContain('private-password')
  expect(JSON.stringify(log.record.mock.calls)).not.toContain('hashed')
  log.record.mockClear(); repo.findByIdForUpdate.mockResolvedValue(null)
  await expect(command.execute(1, { displayName: 'ใหม่' }, actor)).rejects.toThrow()
  expect(log.record).not.toHaveBeenCalled()
})
for (const action of ['create', 'update', 'delete'] as const) test(`role.${action} records successful mutations; authorization rejects before any audit`, async () => {
  const repo = mockRoleRepository(), log = mockAuditLog(), uow = mockUnitOfWork()
  const role = new RoleEntity({ id: 8, name: 'ผู้จัดการ', systemKey: null, permissions: ['sales.void'] })
  repo.findByIdForUpdate.mockResolvedValue(role); repo.create.mockResolvedValue(role); repo.update.mockImplementation(async p => p)
  const usage = { countUsers: mock(async () => 0) }
  const run = (who: {id:number;displayName:string;role:'owner'|'cashier'}) => action === 'create' ? new CreateRoleUseCase(repo, uow, log).execute({ name: 'ผู้จัดการ', permissions: ['sales.void'] }, who) : action === 'update' ? new UpdateRoleUseCase(repo, uow, log).execute(8, { name: 'หัวหน้า' }, who) : new DeleteRoleUseCase(repo, uow, usage, log).execute(8, who)
  await run(owner)
  expect(log.record.mock.calls[0]?.[2]).toMatchObject({ action: `role.${action}`, entityType: 'role', entityId: '8' })
  if (action === 'update') expect(log.record.mock.calls[0]?.[2]).toMatchObject({ before: { name: 'ผู้จัดการ' }, after: { name: 'หัวหน้า' } })
  log.record.mockClear()
  await expect(run({ ...actor, role: 'cashier' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  expect(log.record).not.toHaveBeenCalled()
})
test('settings update records only changed settings, with no history for a no-op', async () => {
  const repo = mockShopSettingsRepository(), log = mockAuditLog()
  repo.getForUpdate.mockResolvedValue(new ShopSettingsEntity(DEFAULT_SHOP_SETTINGS)); repo.save.mockImplementation(async p => p)
  const command = new UpdateShopSettingsUseCase(repo, mockShiftSettingsGuard(), mockUnitOfWork(), log)
  await command.execute({ shopName: 'ร้านใหม่' }, actor)
  expect(log.record.mock.calls[0]?.[2]).toMatchObject({ action: 'settings.update', before: { shopName: 'TillumiPOS' }, after: { shopName: 'ร้านใหม่' } })
  log.record.mockClear(); await command.execute({ shopName: 'TillumiPOS' }, actor)
  expect(log.record).not.toHaveBeenCalled()
})
import { ShiftEntity } from '../../../../domains/shift.domain'
import { CommandIdempotency } from '../../../shared/applications/command-idempotency'
import type { ICommandReceipts } from '../../../shared/ports/command-receipts.port'
import type { IShiftRepository } from '../../../shifts/applications/ports/shift.repository'
import type { IShiftSummaryRepository } from '../../../shifts/applications/ports/shift-summary.repository'
import { CancelShiftClosingUseCase, CloseShiftUseCase } from '../../../shifts/applications/usecases/shift-lifecycle.usecases'
import { RecordCashRefundUseCase } from '../../../sales/applications/usecases/record-cash-refund.usecase'
import { VoidSaleV2UseCase } from '../../../sales/applications/usecases/void-sale-v2.usecase'
import { mockCheckoutPolicy } from '../../../../__tests__/mocks'
const receiptStore = () => {
  const prior = new Map<string, { requestHash: string; result: unknown }>()
  return new CommandIdempotency({ lock: mock(async () => { }), find: mock(async (scope) => prior.get(scope.key) ?? null), create: mock<ICommandReceipts['create']>(async (scope, requestHash, result) => { prior.set(scope.key, { requestHash, result }) }) })
}
test('v2 void replay returns the prior sale without repeating the audit or stock return', async () => {
  const repo = mockSaleRepository(), ledger = mockStockLedger(), log = mockAuditLog(), uow = mockUnitOfWork()
  repo.findByIdForUpdate.mockResolvedValue(makeSale())
  const command = new VoidSaleV2UseCase(new VoidSaleUseCase(repo, ledger, uow, mockClock(now), log), uow, receiptStore())
  const key = crypto.randomUUID()
  await command.execute(1, { reason: 'ผิด' }, owner, 1, key)
  await command.execute(1, { reason: 'ผิด' }, owner, 1, key)
  expect(log.record).toHaveBeenCalledTimes(1)
  expect(ledger.record).toHaveBeenCalledTimes(1)
})
test('cash refund is audited exactly once on idempotent replay and never on rejection', async () => {
  const repo = mockSaleRepository(), ledger = mockShiftLedger(), log = mockAuditLog()
  repo.findByIdForUpdate.mockResolvedValue(makeSale().void('ผิด', 5, now))
  const command = new RecordCashRefundUseCase(repo, ledger, mockUnitOfWork(), mockClock(now), receiptStore(), log)
  const key = crypto.randomUUID()
  await command.execute(1, { shiftId: 7, reason: 'คืนเต็มจำนวน' }, actor, 1, key)
  await command.execute(1, { shiftId: 7, reason: 'คืนเต็มจำนวน' }, actor, 1, key)
  expect(log.record).toHaveBeenCalledTimes(1)
  expect(log.record.mock.calls[0]?.[2]).toMatchObject({ action: 'sale.cash_refund', after: { amountSatang: 3000, shiftId: 7 }, reason: 'คืนเต็มจำนวน' })
  log.record.mockClear(); repo.findByIdForUpdate.mockResolvedValue(makeSale())
  await expect(command.execute(1, { shiftId: 7, reason: 'ยังไม่ยกเลิก' }, actor, 1, crypto.randomUUID())).rejects.toThrow()
  expect(log.record).not.toHaveBeenCalled()
})
const closingShift = () => new ShiftEntity({ id: 1, branchId: 1, registerId: 1, status: 'closing', openedAt: now, openedById: 2, openedByName: 'ผู้ขาย', openingCashSatang: 100, openingNote: null, currency: 'THB', timeZone: 'Asia/Bangkok', closingRevision: 1, closingStartedAt: now, closingStartedById: 2, closingStartedByName: 'ผู้เริ่มนับ', closingExpectedCashSatang: 100, closedAt: null, closedById: null, closedByName: null, countedCashSatang: null, cashDifferenceSatang: null, differenceReason: null })
const shiftRepository = (): IShiftRepository => ({ create: mock(), findById: mock(), findByIdForUpdate: mock(async () => closingShift()), findCurrentByRegister: mock(), list: mock(), update: mock(async p => p), cashDeltas: mock(async () => []), addCashEntry: mock(), hasCashRefund: mock(), listCashEntries: mock() })
const summaries = (): IShiftSummaryRepository => ({ cashTotals: mock(), freeze: mock(), discard: mock(async () => { }), findFrozen: mock() })
for (const operation of ['close', 'cancel'] as const) test(`custom shifts.override permits ${operation} and is audited only when taking over another counter`, async () => {
  const log = mockAuditLog(), repo = shiftRepository(), policy = mockCheckoutPolicy()
  policy.isShiftsEnabled.mockResolvedValue(true)
  const custom = { ...actor, role: 'cashier' as const, permissions: ['shifts.override' as const] }
  const command = operation === 'close' ? new CloseShiftUseCase(policy, repo, mockUnitOfWork(), mockClock(now), receiptStore(), { forShift: async () => ({ paidUnclaimed: 0, unresolvedAttempts: 0, pending: { count: 0, amountSatang: 0 } }) }, log) : new CancelShiftClosingUseCase(policy, repo, mockUnitOfWork(), receiptStore(), summaries(), log)
  const input = operation === 'close' ? { closingRevision: 1, countedCashSatang: 100 } : { closingRevision: 1 }
  await command.execute(1, input, custom, 1, crypto.randomUUID())
  expect(log.record.mock.calls[0]).toEqual([{ id: 5, name: 'สมหญิง' }, 1, expect.objectContaining({ action: 'shift.override_close', before: { status: 'closing', closingStartedById: 2 }, after: { status: operation === 'close' ? 'closed' : 'open' } })])
  log.record.mockClear()
  await command.execute(1, input, { ...actor, id: 2, role: 'cashier' }, 1, crypto.randomUUID())
  expect(log.record).not.toHaveBeenCalled()
  await expect(command.execute(1, input, { ...actor, role: 'cashier' }, 1, crypto.randomUUID())).rejects.toMatchObject({ code: 'SHIFT_CLOSING_OWNER_REQUIRED' })
  expect(log.record).not.toHaveBeenCalled()
})

