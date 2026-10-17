import { describe, expect, test } from 'bun:test'
import { mockKitchenRoutingRepository } from '../../../../__tests__/mocks'
import { ListCategoryRoutingUseCase } from './list-category-routing.usecase'

describe('ListCategoryRoutingUseCase', () => {
  test('คืนการผูกหมวดกับสถานีเป็นรายการคู่ categoryId กับ stationId', async () => {
    const routing = mockKitchenRoutingRepository()
    routing.stationsByCategory.mockResolvedValue(
      new Map([
        [1, 2],
        [4, 2],
        [7, 3],
      ]),
    )

    const listed = await new ListCategoryRoutingUseCase(routing).execute()

    expect(listed).toEqual([
      { categoryId: 1, stationId: 2 },
      { categoryId: 4, stationId: 2 },
      { categoryId: 7, stationId: 3 },
    ])
  })

  test('ร้านที่ยังไม่ผูกหมวดใดเลยได้รายการว่าง', async () => {
    const routing = mockKitchenRoutingRepository()

    expect(await new ListCategoryRoutingUseCase(routing).execute()).toEqual([])
  })
})
