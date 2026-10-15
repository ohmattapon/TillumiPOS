import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { KitchenStationEntity } from '../../../../domains/kitchen-station.domain'
import { mockKitchenStationRepository } from '../../../../__tests__/mocks'
import { CreateKitchenStationUseCase } from './create-kitchen-station.usecase'
import { ListKitchenStationsUseCase } from './list-kitchen-stations.usecase'
import { UpdateKitchenStationUseCase } from './update-kitchen-station.usecase'

let repo: ReturnType<typeof mockKitchenStationRepository>

const station = (overrides: Partial<{ id: number; name: string; sortOrder: number; isActive: boolean }> = {}) =>
  new KitchenStationEntity({ id: 1, name: 'ครัว', sortOrder: 0, isActive: true, ...overrides })

beforeEach(() => {
  repo = mockKitchenStationRepository()
  repo.create.mockImplementation(async (entity) => entity)
  repo.update.mockImplementation(async (entity) => entity)
})

describe('ListKitchenStationsUseCase', () => {
  test('ลิสต์สถานีทั้งหมดรวมที่ปิดอยู่ เพื่อให้เจ้าของจัดการได้', async () => {
    repo.findAll.mockResolvedValue([station(), station({ id: 2, name: 'บาร์', isActive: false })])

    const listed = await new ListKitchenStationsUseCase(repo).execute()

    expect(listed.map((row) => row.name)).toEqual(['ครัว', 'บาร์'])
  })
})

describe('CreateKitchenStationUseCase', () => {
  test('สร้างสถานีที่เปิดใช้งานและลำดับเริ่มต้นเป็นศูนย์', async () => {
    const created = await new CreateKitchenStationUseCase(repo).execute({ name: '  ครัว  ' })

    expect(created.toSnapshot()).toEqual({ id: 0, name: 'ครัว', sortOrder: 0, isActive: true })
  })

  test('ชื่อว่างถูกปฏิเสธก่อนเขียนฐานข้อมูล', async () => {
    await expect(new CreateKitchenStationUseCase(repo).execute({ name: '' })).rejects.toBeInstanceOf(ZodError)
    expect(repo.create).not.toHaveBeenCalled()
  })
})

describe('UpdateKitchenStationUseCase', () => {
  test('เปิดหรือปิดสถานีโดยไม่เปลี่ยนชื่อ', async () => {
    repo.findById.mockResolvedValue(station())

    const updated = await new UpdateKitchenStationUseCase(repo).execute(1, { isActive: false })

    expect(updated.isActive).toBe(false)
    expect(updated.name).toBe('ครัว')
  })

  test('สถานีที่ไม่มีถูกตอบว่าไม่พบ', async () => {
    repo.findById.mockResolvedValue(null)

    await expect(new UpdateKitchenStationUseCase(repo).execute(9, { isActive: false })).rejects.toBeInstanceOf(
      DomainNotFoundError,
    )
  })
})
