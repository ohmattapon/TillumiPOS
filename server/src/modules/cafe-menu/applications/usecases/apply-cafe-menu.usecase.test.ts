import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeCategory, makeModifierGroup, makeModifierOption, makeProduct } from '../../../../__tests__/factories'
import {
  mockAuditLog,
  mockCategoryRepository,
  mockModifierRepository,
  mockProductRepository,
  mockUnitOfWork,
} from '../../../../__tests__/mocks'
import { CategoryEntity } from '../../../../domains/category.domain'
import { ModifierGroupEntity } from '../../../../domains/modifier.domain'
import { ProductEntity } from '../../../../domains/product.domain'
import { ApplyCafeMenuUseCase } from './apply-cafe-menu.usecase'

const owner = { id: 1, displayName: 'เจ้าของ', role: 'owner' as const, permissions: [] }
const cashier = { id: 2, displayName: 'แคชเชียร์', role: 'cashier' as const, permissions: ['products.write' as const] }

describe('ApplyCafeMenuUseCase', () => {
  let categories: ReturnType<typeof mockCategoryRepository>
  let products: ReturnType<typeof mockProductRepository>
  let modifiers: ReturnType<typeof mockModifierRepository>
  let audit: ReturnType<typeof mockAuditLog>
  let unitOfWork: ReturnType<typeof mockUnitOfWork>
  let useCase: ApplyCafeMenuUseCase

  beforeEach(() => {
    categories = mockCategoryRepository()
    products = mockProductRepository()
    modifiers = mockModifierRepository()
    audit = mockAuditLog()
    unitOfWork = mockUnitOfWork()
    useCase = new ApplyCafeMenuUseCase(categories, products, modifiers, unitOfWork, audit)

    const counter = (start: number) => {
      let next = start
      return () => next++
    }
    const nextCategoryId = counter(7)
    const nextGroupId = counter(3)
    const nextProductId = counter(100)

    categories.findAll.mockResolvedValue([])
    modifiers.findAllGroups.mockResolvedValue([])
    products.findAll.mockResolvedValue({ items: [], total: 0 })
    categories.create.mockImplementation(async (entity) => new CategoryEntity({ ...entity.toSnapshot(), id: nextCategoryId() }))
    modifiers.createGroup.mockImplementation(async (entity) => new ModifierGroupEntity({ ...entity.toSnapshot(), id: nextGroupId() }))
    modifiers.createOption.mockImplementation(async (entity) => entity)
    products.create.mockImplementation(async (entity) => new ProductEntity({ ...entity.toSnapshot(), id: nextProductId() }))
  })

  test('adds the ticked drinks with their own category and groups, and answers with the counts', async () => {
    const applied = await useCase.execute({ itemKeys: ['CAFE-AME-HOT', 'CAFE-TEA-HOT'] }, owner, 1)

    expect(categories.create.mock.calls.map(([category]) => category.name)).toEqual(['กาแฟ', 'ชาและโกโก้'])
    expect(modifiers.createGroup.mock.calls.map(([group]) => group.name)).toEqual(['ความหวาน', 'ท็อปปิ้ง'])
    expect(modifiers.createOption.mock.calls.map(([option]) => option.name)).toEqual([
      'หวานปกติ',
      'หวานน้อย',
      'หวานมาก',
      'ไม่ใส่น้ำตาล',
      'วิปครีม',
      'ช็อตเอสเพรสโซ่เพิ่ม',
      'ไซรัปคาราเมล',
    ])
    expect(modifiers.createOption.mock.calls[0]![0].isDefault).toBe(true)
    expect(products.create.mock.calls.map(([product]) => product.toSnapshot())).toMatchObject([
      {
        sku: 'CAFE-AME-HOT',
        name: 'อเมริกาโน่ร้อน',
        priceSatang: 4500,
        costSatang: 0,
        trackStock: false,
        barcode: null,
        isActive: true,
        categoryId: 7,
      },
      { sku: 'CAFE-TEA-HOT', name: 'ชาไทยร้อน', priceSatang: 4500, categoryId: 8 },
    ])
    expect(products.create.mock.calls[0]![1]).toBe(1)
    expect(products.create.mock.calls.map(([product]) => product.productType)).toEqual(['cafe', 'cafe'])
    // The coffee gets sweetness and toppings, the tea only sweetness, in the order the set asks them.
    expect(modifiers.setProductGroups.mock.calls).toEqual([
      [100, [3, 4]],
      [101, [3]],
    ])

    expect(applied).toEqual({
      added: { categories: 2, products: 2, groups: 2, options: 7 },
      reused: { categories: 0, groups: 0 },
      skipped: { products: 0, items: [] },
    })
  })

  test('an item the shop already has is skipped, is never linked, and drags nothing in', async () => {
    products.findAll.mockResolvedValue({
      items: [makeProduct({ id: 55, sku: 'CAFE-AME-HOT', name: 'อเมริกาโน่ร้อน' })],
      total: 1,
    })

    const applied = await useCase.execute({ itemKeys: ['CAFE-AME-HOT'] }, owner, 1)

    expect(categories.create).not.toHaveBeenCalled()
    expect(modifiers.createGroup).not.toHaveBeenCalled()
    expect(products.create).not.toHaveBeenCalled()
    expect(modifiers.setProductGroups).not.toHaveBeenCalled()
    expect(applied.added).toEqual({ categories: 0, products: 0, groups: 0, options: 0 })
    expect(applied.skipped).toEqual({ products: 1, items: [{ key: 'CAFE-AME-HOT', name: 'อเมริกาโน่ร้อน' }] })
  })

  test('a category and a group the shop already has are reused by name', async () => {
    categories.findAll.mockResolvedValue([makeCategory({ id: 4, name: 'กาแฟ' })])
    modifiers.findAllGroups.mockResolvedValue([
      { group: makeModifierGroup({ id: 9, name: 'ความหวาน' }), options: [makeModifierOption({ id: 10, groupId: 9 })], productIds: [] },
    ])

    const applied = await useCase.execute({ itemKeys: ['CAFE-AME-HOT'] }, owner, 1)

    expect(categories.create).not.toHaveBeenCalled()
    expect(modifiers.createGroup.mock.calls.map(([group]) => group.name)).toEqual(['ท็อปปิ้ง'])
    expect(products.create.mock.calls[0]![0].categoryId).toBe(4)
    expect(modifiers.setProductGroups.mock.calls).toEqual([[100, [9, 3]]])
    expect(applied.reused).toEqual({ categories: 1, groups: 1 })
  })

  test('a key that is not in the set is refused before anything is created', async () => {
    await expect(useCase.execute({ itemKeys: ['NOPE'] }, owner, 1)).rejects.toMatchObject({
      code: 'INVALID_CAFE_MENU_ITEM',
      params: { key: 'NOPE' },
    })

    expect(categories.create).not.toHaveBeenCalled()
    expect(products.create).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })

  test('an actor missing a permission is refused before anything is read or written', async () => {
    await expect(useCase.execute({ itemKeys: ['CAFE-AME-HOT'] }, cashier, 1)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      params: { permission: 'categories.write' },
    })

    expect(categories.findAll).not.toHaveBeenCalled()
    expect(products.create).not.toHaveBeenCalled()
  })

  test('an empty list is refused before anything is read', async () => {
    await expect(useCase.execute({ itemKeys: [] }, owner, 1)).rejects.toBeInstanceOf(ZodError)
    expect(categories.findAll).not.toHaveBeenCalled()
  })

  test('the whole run is one unit of work with one audit entry', async () => {
    await useCase.execute({ itemKeys: ['CAFE-AME-HOT'] }, owner, 1)

    expect(unitOfWork.run).toHaveBeenCalledTimes(1)
    expect(audit.record).toHaveBeenCalledTimes(1)
    expect(audit.record.mock.calls[0]![0]).toEqual({ id: 1, name: 'เจ้าของ' })
    expect(audit.record.mock.calls[0]![1]).toBe(1)
    expect(audit.record.mock.calls[0]![2]).toMatchObject({
      action: 'cafe_menu.applied',
      entityType: 'cafe_menu',
      after: { addedProducts: ['CAFE-AME-HOT'], addedCategories: ['กาแฟ'], skippedProducts: [] },
    })
  })
})
