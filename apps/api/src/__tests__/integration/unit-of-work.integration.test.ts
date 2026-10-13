import { beforeEach, describe, expect, test } from 'bun:test'
import { container } from 'tsyringe'
import { resetDatabase } from '../../../test/harness'
import { categories } from '../../infrastructure/database/schema/categories'
import { currentExecutor } from '../../libs/transaction-context'
import '../../modules/di-registrations'
import type { IUnitOfWork } from '../../modules/shared/ports/unit-of-work.port'
import { TOKENS } from '../../modules/tokens'

const unitOfWork = container.resolve<IUnitOfWork>(TOKENS.UnitOfWork)

// Stand-ins for two repositories: each call picks up whatever transaction is current.
const insert = (name: string) => currentExecutor().insert(categories).values({ name })
const storedNames = async () =>
  (await currentExecutor().select({ name: categories.name }).from(categories).orderBy(categories.name)).map(
    (row) => row.name,
  )

beforeEach(() => resetDatabase())

describe('unit of work', () => {
  test('commits every write made inside it', async () => {
    await unitOfWork.run(async () => {
      await insert('A')
      await insert('B')
    })

    expect(await storedNames()).toEqual(['A', 'B'])
  })

  test('returns the value of the work', async () => {
    expect(await unitOfWork.run(async () => 42)).toBe(42)
  })

  test('rolls back every write when the work throws, and rethrows the same error', async () => {
    const failure = new Error('stock ran out')

    const attempt = unitOfWork.run(async () => {
      await insert('A')
      await insert('B')
      throw failure
    })

    await expect(attempt).rejects.toBe(failure)
    expect(await storedNames()).toEqual([])
  })

  test('writes inside see each other before commit, writes outside do not', async () => {
    await unitOfWork.run(async () => {
      await insert('A')
      expect(await storedNames()).toEqual(['A'])
    })
  })

  test('a nested run joins the outer transaction', async () => {
    const attempt = unitOfWork.run(async () => {
      await unitOfWork.run(async () => {
        await insert('inner')
      })
      throw new Error('outer failed after the inner work finished')
    })

    await expect(attempt).rejects.toThrow('outer failed')
    expect(await storedNames()).toEqual([])
  })

  test('concurrent runs are isolated: one failing does not undo the other', async () => {
    const succeeding = unitOfWork.run(async () => {
      await insert('kept')
      await Bun.sleep(20)
      await insert('kept too')
    })
    const failing = unitOfWork.run(async () => {
      await insert('discarded')
      await Bun.sleep(5)
      throw new Error('this one fails')
    })

    await expect(failing).rejects.toThrow('this one fails')
    await succeeding
    expect(await storedNames()).toEqual(['kept', 'kept too'])
  })

  test('work outside any run writes straight to the database', async () => {
    await insert('direct')

    expect(await storedNames()).toEqual(['direct'])
  })
})
