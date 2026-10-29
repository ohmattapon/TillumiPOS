import { mockAuditLog as auditMock, mockUnitOfWork as auditUnitOfWork } from '../../../../__tests__/mocks'
import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeProduct, makeStockMovement } from '../../../../__tests__/factories'
import {
  mockProductRepository,
  mockStockLedger,
  mockStockMovementRepository,
  mockUnitOfWork,
} from '../../../../__tests__/mocks'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { StockLedger } from '../services/stock-ledger'
import { AdjustStockUseCase } from './adjust-stock.usecase'
import { ListStockMovementsUseCase } from './list-stock-movements.usecase'
import { ReceiveStockUseCase } from './receive-stock.usecase'

let products: ReturnType<typeof mockProductRepository>

beforeEach(() => {
  products = mockProductRepository()
})

describe('StockLedger', () => {
  let movements: ReturnType<typeof mockStockMovementRepository>
  let ledger: StockLedger

  beforeEach(() => {
    movements = mockStockMovementRepository()
    movements.create.mockImplementation(async (movement) =>
      makeStockMovement({ ...movement, reference: movement.reference ?? null, note: movement.note ?? null }),
    )
    ledger = new StockLedger(products, movements)
  })

  test('applies the change to the product and writes the row with the resulting balance', async () => {
    products.adjustStock.mockResolvedValue(7)

    const recorded = await ledger.record({
      branchId: 1,
      productId: 2,
      type: 'sale',
      quantity: -3,
      userId: 4,
      reference: 'R-1',
    })

    expect(products.adjustStock).toHaveBeenCalledWith(2, 1, -3)
    expect(movements.create).toHaveBeenCalledWith({
      branchId: 1,
      productId: 2,
      type: 'sale',
      quantity: -3,
      userId: 4,
      reference: 'R-1',
      balanceAfter: 7,
    })
    expect(recorded?.balanceAfter).toBe(7)
  })

  test('a product that does not track stock gets no ledger row', async () => {
    products.adjustStock.mockResolvedValue(null)

    expect(await ledger.record({ branchId: 1, productId: 2, type: 'sale', quantity: -3, userId: 4 })).toBeNull()
    expect(movements.create).not.toHaveBeenCalled()
  })

  test.each([0, 1.5])('refuses a quantity of %p before touching the product', async (quantity) => {
    await expect(ledger.record({ branchId: 1, productId: 2, type: 'adjust', quantity, userId: 4 })).rejects.toBeInstanceOf(DomainError)
    expect(products.adjustStock).not.toHaveBeenCalled()
  })
})

describe('stock commands', () => {
  let ledger: ReturnType<typeof mockStockLedger>
  let unitOfWork: ReturnType<typeof mockUnitOfWork>

  beforeEach(() => {
    ledger = mockStockLedger()
    unitOfWork = mockUnitOfWork()
    ledger.record.mockImplementation(async (movement) =>
      makeStockMovement({ ...movement, reference: null, note: movement.note ?? null, balanceAfter: 99 }),
    )
    products.findManyForUpdate.mockResolvedValue([makeProduct({ id: 2, stockQty: 10 })])
  })

  describe('ReceiveStockUseCase', () => {
    const receive = () => new ReceiveStockUseCase(products, ledger, unitOfWork, auditMock())

    test('records a positive receive movement for the acting user, inside one unit of work', async () => {
      const movement = await receive().execute({ productId: 2, quantity: 5, note: 'PO-1' }, { id: 4, displayName: 'ผู้ทดสอบ' }, 1)

      expect(unitOfWork.run).toHaveBeenCalledTimes(1)
      expect(products.findManyForUpdate).toHaveBeenCalledWith([2], 1)
      expect(ledger.record).toHaveBeenCalledWith({
        branchId: 1,
        productId: 2,
        type: 'receive',
        quantity: 5,
        note: 'PO-1',
        userId: 4,
      })
      expect(movement.type).toBe('receive')
    })

    test('an omitted note is stored as null', async () => {
      await receive().execute({ productId: 2, quantity: 5 }, { id: 4, displayName: 'ผู้ทดสอบ' }, 1)

      expect(ledger.record.mock.calls[0]![0].note).toBeNull()
    })

    test('an unknown product is not found, and nothing is recorded', async () => {
      products.findManyForUpdate.mockResolvedValue([])

      const attempt = receive().execute({ productId: 9999, quantity: 1 }, { id: 4, displayName: 'ผู้ทดสอบ' }, 1)

      await expect(attempt).rejects.toBeInstanceOf(DomainNotFoundError)
      await expect(attempt).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'ไม่พบสินค้า' })
      expect(ledger.record).not.toHaveBeenCalled()
    })

    test('a product that does not track stock cannot be received', async () => {
      products.findManyForUpdate.mockResolvedValue([makeProduct({ id: 2, trackStock: false })])

      await expect(receive().execute({ productId: 2, quantity: 1 }, { id: 4, displayName: 'ผู้ทดสอบ' }, 1)).rejects.toMatchObject({
        code: 'STOCK_NOT_TRACKED',
        message: 'สินค้านี้ไม่ได้ตั้งให้นับสต็อก',
      })
      expect(ledger.record).not.toHaveBeenCalled()
    })

    test.each([
      ['a zero quantity', { productId: 2, quantity: 0 }],
      ['a negative quantity', { productId: 2, quantity: -1 }],
      ['a fractional quantity', { productId: 2, quantity: 1.5 }],
      ['a note over 500 characters', { productId: 2, quantity: 1, note: 'x'.repeat(501) }],
      ['a missing product id', { quantity: 1 }],
    ])('rejects %s before opening a unit of work', async (_label, input) => {
      await expect(receive().execute(input, { id: 4, displayName: 'ผู้ทดสอบ' }, 1)).rejects.toBeInstanceOf(ZodError)
      expect(unitOfWork.run).not.toHaveBeenCalled()
    })

    describe('in packs', () => {
      const casePack = { id: 5, barcode: 'CASE-1', size: 12, priceSatang: null, isActive: true }

      beforeEach(() => {
        products.findManyForUpdate.mockResolvedValue([makeProduct({ id: 2, stockQty: 10, packs: [casePack] })])
      })

      test('counts the pack into the pieces it holds and says so in the note', async () => {
        await receive().execute({ productId: 2, quantity: 2, packId: 5 }, { id: 4, displayName: 'ผู้ทดสอบ' }, 1)

        expect(ledger.record).toHaveBeenCalledWith({
          branchId: 1,
          productId: 2,
          type: 'receive',
          quantity: 24,
          note: 'รับ 2 ลัง (CASE-1) = 24 ชิ้น',
          userId: 4,
        })
      })

      test('a pack that is switched off can still be received', async () => {
        products.findManyForUpdate.mockResolvedValue([makeProduct({ id: 2, packs: [{ ...casePack, isActive: false }] })])

        await receive().execute({ productId: 2, quantity: 1, packId: 5 }, { id: 4, displayName: 'ผู้ทดสอบ' }, 1)

        expect(ledger.record.mock.calls[0]![0].quantity).toBe(12)
      })

      test('a pack the product does not have is refused and nothing is recorded', async () => {
        await expect(receive().execute({ productId: 2, quantity: 1, packId: 999 }, { id: 4, displayName: 'ผู้ทดสอบ' }, 1))
          .rejects.toMatchObject({ code: 'PACK_NOT_FOUND', params: { packId: 999 } })
        expect(ledger.record).not.toHaveBeenCalled()
      })
    })
  })

  describe('AdjustStockUseCase', () => {
    const adjust = () => new AdjustStockUseCase(products, ledger, unitOfWork, auditMock())

    test.each([
      [7, -3],
      [12, 2],
      [0, -10],
    ])('counting %p against a balance of 10 records a difference of %p', async (countedQty, difference) => {
      await adjust().execute({ productId: 2, countedQty, note: 'นับสต็อก' }, { id: 4, displayName: 'ผู้ทดสอบ' }, 1)

      expect(ledger.record).toHaveBeenCalledWith({
        branchId: 1,
        productId: 2,
        type: 'adjust',
        quantity: difference,
        note: 'นับสต็อก',
        userId: 4,
      })
    })

    test('a count equal to the balance changes nothing and says so', async () => {
      await expect(adjust().execute({ productId: 2, countedQty: 10 }, { id: 4, displayName: 'ผู้ทดสอบ' }, 1)).rejects.toMatchObject({
        code: 'NO_CHANGE',
        message: 'ยอดที่นับได้ตรงกับยอดในระบบอยู่แล้ว',
      })
      expect(ledger.record).not.toHaveBeenCalled()
    })

    test('an unknown product and an untracked product are refused like a receive', async () => {
      products.findManyForUpdate.mockResolvedValue([])
      await expect(adjust().execute({ productId: 9999, countedQty: 1 }, { id: 4, displayName: 'ผู้ทดสอบ' }, 1)).rejects.toBeInstanceOf(DomainNotFoundError)

      products.findManyForUpdate.mockResolvedValue([makeProduct({ id: 2, trackStock: false })])
      await expect(adjust().execute({ productId: 2, countedQty: 1 }, { id: 4, displayName: 'ผู้ทดสอบ' }, 1)).rejects.toMatchObject({ code: 'STOCK_NOT_TRACKED' })
    })

    test('rejects a negative count', async () => {
      await expect(adjust().execute({ productId: 2, countedQty: -1 }, { id: 4, displayName: 'ผู้ทดสอบ' }, 1)).rejects.toBeInstanceOf(ZodError)
    })
  })
})

describe('ListStockMovementsUseCase', () => {
  test('passes the validated query to the repository', async () => {
    const movements = mockStockMovementRepository()
    const stored = { items: [makeStockMovement()], total: 1 }
    movements.findAll.mockResolvedValue(stored)

    const result = await new ListStockMovementsUseCase(movements).execute({ productId: 2, limit: 50, extra: 1 }, 1)

    expect(result).toBe(stored)
    expect(movements.findAll).toHaveBeenCalledWith({ productId: 2, limit: 50, branchId: 1 })
  })

  test('rejects a limit over 500', async () => {
    const movements = mockStockMovementRepository()

    await expect(new ListStockMovementsUseCase(movements).execute({ limit: 501 }, 1)).rejects.toBeInstanceOf(ZodError)
  })
})
