import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeModifierGroup, makeModifierOption, makeProduct } from '../../../../__tests__/factories'
import { mockModifierRepository, mockProductRepository, mockUnitOfWork } from '../../../../__tests__/mocks'
import { LineOptionsResolver } from '../services/line-options-resolver'
import { CreateModifierGroupUseCase } from './create-modifier-group.usecase'
import { CreateModifierOptionUseCase } from './create-modifier-option.usecase'
import { ListModifierGroupsUseCase } from './list-modifier-groups.usecase'
import { SetProductModifierGroupsUseCase } from './set-product-modifier-groups.usecase'
import { UpdateModifierGroupUseCase } from './update-modifier-group.usecase'
import { UpdateModifierOptionUseCase } from './update-modifier-option.usecase'

let repo: ReturnType<typeof mockModifierRepository>

beforeEach(() => {
  repo = mockModifierRepository()
  repo.createGroup.mockImplementation(async (entity) => entity)
  repo.updateGroup.mockImplementation(async (entity) => entity)
  repo.createOption.mockImplementation(async (entity) => entity)
  repo.updateOption.mockImplementation(async (entity) => entity)
})

describe('ListModifierGroupsUseCase', () => {
  test('lists every group with its options and products', async () => {
    const view = { group: makeModifierGroup(), options: [makeModifierOption()], productIds: [4] }
    repo.findAllGroups.mockResolvedValue([view])

    expect(await new ListModifierGroupsUseCase(repo).execute()).toEqual([view])
  })
})

describe('CreateModifierGroupUseCase', () => {
  test('creates an optional single-choice group by default, with no options or products', async () => {
    const created = await new CreateModifierGroupUseCase(repo).execute({ name: 'ท็อปปิง' })

    expect(created.group.toSnapshot()).toEqual({
      id: 0,
      name: 'ท็อปปิง',
      required: false,
      maxSelections: 1,
      sortOrder: 0,
      isActive: true,
    })
    expect(created).toMatchObject({ options: [], productIds: [] })
  })

  test.each([
    ['an empty name', { name: '' }],
    ['no limit above zero', { name: 'x', maxSelections: 0 }],
    ['a limit above 20', { name: 'x', maxSelections: 21 }],
    ['a non-boolean required', { name: 'x', required: 'yes' }],
  ])('rejects %s before writing', async (_label, input) => {
    await expect(new CreateModifierGroupUseCase(repo).execute(input)).rejects.toBeInstanceOf(ZodError)
    expect(repo.createGroup).not.toHaveBeenCalled()
  })
})

describe('UpdateModifierGroupUseCase', () => {
  test('changes only the given fields and answers with the group as the owner sees it', async () => {
    repo.findGroupById.mockResolvedValue(makeModifierGroup({ id: 3 }))
    const view = { group: makeModifierGroup({ id: 3, required: false }), options: [], productIds: [] }
    repo.findGroupView.mockResolvedValue(view)

    const updated = await new UpdateModifierGroupUseCase(repo).execute(3, { required: false })

    expect(repo.updateGroup.mock.calls[0]![0].toSnapshot()).toMatchObject({ id: 3, name: 'ระดับความหวาน', required: false })
    expect(updated).toBe(view)
  })

  test('an unknown group is not found and nothing is written', async () => {
    repo.findGroupById.mockResolvedValue(null)

    await expect(new UpdateModifierGroupUseCase(repo).execute(9, { name: 'x' })).rejects.toMatchObject({
      code: 'MODIFIER_GROUP_NOT_FOUND',
    })
    expect(repo.updateGroup).not.toHaveBeenCalled()
  })
})

describe('CreateModifierOptionUseCase', () => {
  test('adds an option to a group with its price and cost', async () => {
    repo.findGroupById.mockResolvedValue(makeModifierGroup({ id: 3 }))

    const created = await new CreateModifierOptionUseCase(repo).execute(3, { name: 'ไข่มุก', priceSatang: 1000, costSatang: 400 })

    expect(created.toSnapshot()).toEqual({
      id: 0,
      groupId: 3,
      name: 'ไข่มุก',
      priceSatang: 1000,
      costSatang: 400,
      sortOrder: 0,
      isActive: true,
    })
  })

  test('is free when no price is given', async () => {
    repo.findGroupById.mockResolvedValue(makeModifierGroup({ id: 3 }))

    const created = await new CreateModifierOptionUseCase(repo).execute(3, { name: 'หวานน้อย' })

    expect(created).toMatchObject({ priceSatang: 0, costSatang: 0 })
  })

  test('a negative price is rejected before any read or write', async () => {
    await expect(new CreateModifierOptionUseCase(repo).execute(3, { name: 'x', priceSatang: -1 })).rejects.toBeInstanceOf(ZodError)
    expect(repo.findGroupById).not.toHaveBeenCalled()
  })

  test('an unknown group is not found', async () => {
    repo.findGroupById.mockResolvedValue(null)

    await expect(new CreateModifierOptionUseCase(repo).execute(9, { name: 'x' })).rejects.toMatchObject({
      code: 'MODIFIER_GROUP_NOT_FOUND',
    })
  })
})

describe('UpdateModifierOptionUseCase', () => {
  test('changes the price and deactivates, leaving the rest', async () => {
    repo.findOptionById.mockResolvedValue(makeModifierOption({ id: 10, groupId: 3, priceSatang: 500 }))

    const updated = await new UpdateModifierOptionUseCase(repo).execute(10, { priceSatang: 700, isActive: false })

    expect(updated.toSnapshot()).toMatchObject({ id: 10, groupId: 3, name: 'หวานน้อย', priceSatang: 700, isActive: false })
  })

  test('an unknown option is not found', async () => {
    repo.findOptionById.mockResolvedValue(null)

    await expect(new UpdateModifierOptionUseCase(repo).execute(9, { name: 'x' })).rejects.toMatchObject({
      code: 'MODIFIER_OPTION_NOT_FOUND',
    })
  })
})

describe('SetProductModifierGroupsUseCase', () => {
  let products: ReturnType<typeof mockProductRepository>
  let useCase: SetProductModifierGroupsUseCase

  beforeEach(() => {
    products = mockProductRepository()
    products.findById.mockResolvedValue(makeProduct({ id: 5 }))
    useCase = new SetProductModifierGroupsUseCase(repo, products, mockUnitOfWork())
  })

  test('replaces the groups of a product, keeping the order and dropping repeats', async () => {
    repo.findGroupsByIds.mockResolvedValue([makeModifierGroup({ id: 2 }), makeModifierGroup({ id: 1 })])

    const groupIds = await useCase.execute(5, { groupIds: [2, 1, 2] }, 1)

    expect(repo.findGroupsByIds).toHaveBeenCalledWith([2, 1])
    expect(repo.setProductGroups).toHaveBeenCalledWith(5, [2, 1])
    expect(groupIds).toEqual([2, 1])
  })

  test('an empty list takes every group off the product', async () => {
    repo.findGroupsByIds.mockResolvedValue([])

    expect(await useCase.execute(5, { groupIds: [] }, 1)).toEqual([])
    expect(repo.setProductGroups).toHaveBeenCalledWith(5, [])
  })

  test('an unknown product or group is not found and nothing is written', async () => {
    products.findById.mockResolvedValueOnce(null)
    await expect(useCase.execute(9, { groupIds: [1] }, 1)).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' })

    repo.findGroupsByIds.mockResolvedValue([makeModifierGroup({ id: 1 })])
    await expect(useCase.execute(5, { groupIds: [1, 8] }, 1)).rejects.toMatchObject({ code: 'MODIFIER_GROUP_NOT_FOUND' })
    expect(repo.setProductGroups).not.toHaveBeenCalled()
  })
})

describe('LineOptionsResolver', () => {
  test('asks the repository for the groups of the product and applies the rules', async () => {
    repo.findGroupsForProduct.mockResolvedValue([
      { group: makeModifierGroup({ id: 1, required: false }), options: [makeModifierOption({ id: 10, priceSatang: 300, costSatang: 100 })] },
    ])

    const resolved = await new LineOptionsResolver(repo).resolve(5, [10])

    expect(repo.findGroupsForProduct).toHaveBeenCalledWith(5)
    expect(resolved).toMatchObject({ priceSatang: 300, costSatang: 100, key: '10' })
  })

  test('a required group with no choice is refused', async () => {
    repo.findGroupsForProduct.mockResolvedValue([{ group: makeModifierGroup(), options: [makeModifierOption()] }])

    await expect(new LineOptionsResolver(repo).resolve(5, [])).rejects.toMatchObject({ code: 'MODIFIER_REQUIRED' })
  })
})
