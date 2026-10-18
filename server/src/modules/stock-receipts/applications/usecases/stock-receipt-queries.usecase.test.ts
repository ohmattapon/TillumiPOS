import { expect, test } from 'bun:test'
import { mockStockReceiptRepository } from '../../../../__tests__/mocks'
import { GetStockReceiptUseCase } from './get-stock-receipt.usecase'
import { ListStockReceiptsUseCase } from './list-stock-receipts.usecase'
test('receipt query scopes lookups and rejects missing documents', async () => {
  const repository = mockStockReceiptRepository()
  repository.findById.mockResolvedValue(null)
  expect(new GetStockReceiptUseCase(repository).execute({ id: 4 }, 2)).rejects.toMatchObject({ code: 'STOCK_RECEIPT_NOT_FOUND' })
  expect(repository.findById).toHaveBeenCalledWith(4, 2)
})
test('list defaults and supplied pagination reach the branch-scoped read port', async () => {
  const repository = mockStockReceiptRepository()
  repository.findAll.mockResolvedValue({ items: [], total: 0 })
  expect(await new ListStockReceiptsUseCase(repository).execute({}, 2)).toEqual({ items: [], total: 0 })
  expect(repository.findAll).toHaveBeenCalledWith({ branchId: 2, limit: 25, offset: 0 })
  await new ListStockReceiptsUseCase(repository).execute({ limit: '10', offset: '20' }, 3)
  expect(repository.findAll).toHaveBeenLastCalledWith({ branchId: 3, limit: 10, offset: 20 })
})
test.each([{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { offset: -1 }, { offset: 0.5 }])('rejects invalid pagination %j', async input => {
  const repository = mockStockReceiptRepository()
  expect(new ListStockReceiptsUseCase(repository).execute(input, 1)).rejects.toBeDefined()
  expect(repository.findAll).not.toHaveBeenCalled()
})
