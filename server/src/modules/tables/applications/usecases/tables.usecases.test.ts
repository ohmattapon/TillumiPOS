import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeTable } from '../../../../__tests__/factories'
import { mockTableOccupancy, mockTableRepository } from '../../../../__tests__/mocks'
import { CreateTableUseCase } from './create-table.usecase'
import { ListTablesUseCase } from './list-tables.usecase'
import { UpdateTableUseCase } from './update-table.usecase'

let repo: ReturnType<typeof mockTableRepository>
let occupancy: ReturnType<typeof mockTableOccupancy>

beforeEach(() => {
  repo = mockTableRepository()
  occupancy = mockTableOccupancy()
  repo.create.mockImplementation(async (entity) => entity)
  repo.update.mockImplementation(async (entity) => entity)
})

describe('ListTablesUseCase', () => {
  test('lists the tables of the branch with what is open on each', async () => {
    repo.findAll.mockResolvedValue([makeTable({ id: 1 }), makeTable({ id: 2, name: 'T2' })])
    occupancy.byTable.mockResolvedValue(new Map([[2, { openOrders: 2, openTotalSatang: 15000 }]]))

    const listed = await new ListTablesUseCase(repo, occupancy).execute(1)

    expect(repo.findAll).toHaveBeenCalledWith(1)
    expect(listed.map((row) => [row.table.id, row.openOrders, row.openTotalSatang])).toEqual([
      [1, 0, 0],
      [2, 2, 15000],
    ])
  })
})

describe('CreateTableUseCase', () => {
  test('creates a table in the branch with a default place and size', async () => {
    const created = await new CreateTableUseCase(repo).execute({ name: 'T9' }, 3)

    expect(created.toSnapshot()).toEqual({
      id: 0,
      branchId: 3,
      name: 'T9',
      zone: null,
      seats: 4,
      x: 20,
      y: 20,
      width: 120,
      height: 80,
      sortOrder: 0,
      isActive: true,
    })
  })

  test.each([
    ['an empty name', { name: '' }],
    ['a fractional position', { name: 'x', x: 1.5 }],
  ])('rejects %s before writing', async (_label, input) => {
    await expect(new CreateTableUseCase(repo).execute(input, 1)).rejects.toBeInstanceOf(ZodError)
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('a table off the floor is refused by the entity', async () => {
    await expect(new CreateTableUseCase(repo).execute({ name: 'x', x: 990 }, 1)).rejects.toMatchObject({
      code: 'INVALID_TABLE',
    })
  })
})

describe('UpdateTableUseCase', () => {
  test('moves and renames a table of the branch', async () => {
    repo.findById.mockResolvedValue(makeTable({ id: 4, branchId: 1 }))

    const updated = await new UpdateTableUseCase(repo, occupancy).execute(4, { x: 300, y: 100, name: 'A1' }, 1)

    expect(updated.toSnapshot()).toMatchObject({ id: 4, x: 300, y: 100, name: 'A1' })
  })

  test("another branch's table and an unknown table are both not found", async () => {
    repo.findById.mockResolvedValueOnce(makeTable({ branchId: 2 })).mockResolvedValueOnce(null)

    await expect(new UpdateTableUseCase(repo, occupancy).execute(4, { name: 'x' }, 1)).rejects.toMatchObject({
      code: 'TABLE_NOT_FOUND',
    })
    await expect(new UpdateTableUseCase(repo, occupancy).execute(9, { name: 'x' }, 1)).rejects.toMatchObject({
      code: 'TABLE_NOT_FOUND',
    })
    expect(repo.update).not.toHaveBeenCalled()
  })

  test('a table with open orders cannot be closed, but can be once they are paid', async () => {
    repo.findById.mockResolvedValue(makeTable({ id: 4 }))
    occupancy.openOrderCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0)
    const useCase = new UpdateTableUseCase(repo, occupancy)

    await expect(useCase.execute(4, { isActive: false }, 1)).rejects.toMatchObject({ code: 'TABLE_HAS_OPEN_ORDERS' })
    expect((await useCase.execute(4, { isActive: false }, 1)).isActive).toBe(false)
  })

  test('opening the table again does not ask about orders', async () => {
    repo.findById.mockResolvedValue(makeTable({ id: 4, isActive: false }))

    await new UpdateTableUseCase(repo, occupancy).execute(4, { isActive: true }, 1)

    expect(occupancy.openOrderCount).not.toHaveBeenCalled()
  })
})
