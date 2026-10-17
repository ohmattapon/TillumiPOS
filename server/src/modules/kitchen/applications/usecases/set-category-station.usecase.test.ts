import { beforeEach, describe, expect, test } from 'bun:test'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { KitchenStationEntity } from '../../../../domains/kitchen-station.domain'
import { makeCategory } from '../../../../__tests__/factories'
import { mockCategoryRepository, mockKitchenRoutingRepository, mockKitchenStationRepository } from '../../../../__tests__/mocks'
import { SetCategoryStationUseCase } from './set-category-station.usecase'

let categories: ReturnType<typeof mockCategoryRepository>
let stations: ReturnType<typeof mockKitchenStationRepository>
let routing: ReturnType<typeof mockKitchenRoutingRepository>

const kitchen = new KitchenStationEntity({ id: 2, name: 'ครัว', sortOrder: 0, isActive: true })

beforeEach(() => {
  categories = mockCategoryRepository()
  stations = mockKitchenStationRepository()
  routing = mockKitchenRoutingRepository()
  categories.findById.mockResolvedValue(makeCategory({ id: 1 }))
  stations.findById.mockResolvedValue(kitchen)
})

const useCase = () => new SetCategoryStationUseCase(categories, stations, routing)

describe('SetCategoryStationUseCase', () => {
  test('ผูกหมวดกับสถานีที่เปิดอยู่', async () => {
    const result = await useCase().execute(1, { stationId: 2 })

    expect(routing.setStation).toHaveBeenCalledWith(1, 2)
    expect(result).toEqual({ categoryId: 1, stationId: 2 })
  })

  test('ค่า null ทำให้หมวดไม่ส่งครัว', async () => {
    const result = await useCase().execute(1, { stationId: null })

    expect(routing.setStation).toHaveBeenCalledWith(1, null)
    expect(result.stationId).toBeNull()
    expect(stations.findById).not.toHaveBeenCalled()
  })

  test('หมวดที่ไม่มีถูกตอบว่าไม่พบ', async () => {
    categories.findById.mockResolvedValue(null)

    await expect(useCase().execute(9, { stationId: 2 })).rejects.toBeInstanceOf(DomainNotFoundError)
    expect(routing.setStation).not.toHaveBeenCalled()
  })

  test('สถานีที่ไม่มีถูกตอบว่าไม่พบ', async () => {
    stations.findById.mockResolvedValue(null)

    await expect(useCase().execute(1, { stationId: 9 })).rejects.toMatchObject({ code: 'KITCHEN_STATION_NOT_FOUND' })
    expect(routing.setStation).not.toHaveBeenCalled()
  })

  test('สถานีที่ปิดอยู่รับหมวดใหม่ไม่ได้', async () => {
    stations.findById.mockResolvedValue(kitchen.with({ isActive: false }))

    await expect(useCase().execute(1, { stationId: 2 })).rejects.toBeInstanceOf(DomainConflictError)
    expect(routing.setStation).not.toHaveBeenCalled()
  })
})
