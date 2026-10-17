import { beforeEach, describe, expect, test } from 'bun:test'
import { container } from 'tsyringe'
import { resetDatabase } from '../../../../../test/harness'
import { SlideEntity } from '../../../../domains/slide.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { type ISlideRepository, slideRepositoryToken } from '../../applications/ports/slide.repository'

const slide = (overrides: Partial<{ imageKey: string; sortOrder: number; isActive: boolean }> = {}) =>
  new SlideEntity({
    id: 0,
    imageKey: 'slides/11111111-2222-4333-8444-555555555555.png',
    sortOrder: 0,
    isActive: true,
    ...overrides,
  })

const repo = () => container.resolve<ISlideRepository>(slideRepositoryToken)

beforeEach(async () => {
  await resetDatabase()
})

describe('DrizzleSlideRepository', () => {
  test('insert then findById round-trips the slide', async () => {
    const created = await repo().create(slide())

    expect(created.id).toBeGreaterThan(0)
    expect(await repo().findById(created.id)).toEqual(created)
    expect(await repo().findById(9999)).toBeNull()
  })

  test('findActive returns only active slides ordered by sort order', async () => {
    await repo().create(slide({ imageKey: 'slides/aaaaaaaa-2222-4333-8444-555555555555.png', sortOrder: 2 }))
    await repo().create(
      slide({ imageKey: 'slides/bbbbbbbb-2222-4333-8444-555555555555.png', sortOrder: 0, isActive: false }),
    )
    await repo().create(slide({ imageKey: 'slides/cccccccc-2222-4333-8444-555555555555.png', sortOrder: 1 }))

    const active = await repo().findActive()

    expect(active.map((entry) => entry.imageKey)).toEqual([
      'slides/cccccccc-2222-4333-8444-555555555555.png',
      'slides/aaaaaaaa-2222-4333-8444-555555555555.png',
    ])
    expect(active.every((entry) => entry.isActive)).toBe(true)
  })

  test('a duplicate image key is a conflict', async () => {
    await repo().create(slide())

    const attempt = repo().create(slide())

    await expect(attempt).rejects.toBeInstanceOf(DomainConflictError)
    await expect(attempt).rejects.toMatchObject({ code: 'DUPLICATE' })
  })

  test('update overwrites the stored slide, unknown id is not found', async () => {
    const created = await repo().create(slide())

    const updated = await repo().update(created.with({ sortOrder: 5, isActive: false }))

    expect(updated.toSnapshot()).toEqual({ ...created.toSnapshot(), sortOrder: 5, isActive: false })
    await expect(repo().update(new SlideEntity({ ...created.toSnapshot(), id: 9999 }))).rejects.toBeInstanceOf(
      DomainNotFoundError,
    )
  })
})
