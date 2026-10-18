import { beforeEach, describe, expect, test } from 'bun:test'
import { makeBranch, makeModifierGroup, makeModifierOption, makeSlide, makeTable } from '../factories'
import { DomainConflictError } from '../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../domains/errors/domain-not-found.error'
import { MemberEntity } from '../../domains/member.domain'
import { PromotionEntity } from '../../domains/promotion.domain'
import { BranchEntity } from '../../domains/branch.domain'
import { DrizzleBranchRepository } from '../../modules/branches/adapters/repository/branch.drizzle.repository'
import { DrizzleMemberRepository } from '../../modules/members/adapters/repository/member.drizzle.repository'
import { DrizzleModifierRepository } from '../../modules/modifiers/adapters/repository/modifier.drizzle.repository'
import { DrizzlePromotionRepository } from '../../modules/promotions/adapters/repository/promotion.drizzle.repository'
import { DrizzleSlideRepository } from '../../modules/display-slides/adapters/repository/slide.drizzle.repository'
import { DrizzleTableRepository } from '../../modules/tables/adapters/repository/table.drizzle.repository'
import { runInTransaction } from '../../libs/transaction-context'
import { resetDatabase } from '../../../test/harness'

/**
 * Database errors that the use cases' own checks normally prevent (a duplicate name that was free a moment
 * ago, a row deleted between the read and the write). The adapters still turn them into domain errors.
 */
beforeEach(resetDatabase)

const now = new Date('2026-10-15T12:00:00Z')
const promotion = (overrides: Partial<ConstructorParameters<typeof PromotionEntity>[0]> = {}) =>
  new PromotionEntity({
    id: 0, name: 'ลด 10%', kind: 'percent', value: 1000, maxDiscountSatang: null, minSubtotalSatang: 0,
    startsOn: null, endsOn: null, weekdays: null, windowStartMinute: null, windowEndMinute: null,
    audience: 'everyone', isActive: true, scope: null, imageKey: null, createdAt: now, updatedAt: now, ...overrides,
  })
const member = (overrides: Partial<ConstructorParameters<typeof MemberEntity>[0]> = {}) =>
  new MemberEntity({ id: 0, name: 'สมชาย', phone: '0812345678', isActive: true, createdAt: now, updatedAt: now, ...overrides })

describe('branches', () => {
  const branches = new DrizzleBranchRepository()

  test('a second branch with the same code is a conflict', async () => {
    const attempt = branches.create(makeBranch({ id: 0, code: 'MAIN' }))

    await expect(attempt).rejects.toBeInstanceOf(DomainConflictError)
  })

  test('updating a branch that is gone is not found', async () => {
    const attempt = branches.update(makeBranch({ id: 9999, code: 'GONE' }))

    await expect(attempt).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' })
  })

  test('a branch can be read with a row lock, and an unknown one is null', async () => {
    const [locked, missing] = await runInTransaction(async () => [await branches.findByIdForUpdate(1), await branches.findByIdForUpdate(9999)])

    expect(locked).toBeInstanceOf(BranchEntity)
    expect(missing).toBeNull()
  })
})

describe('display slides', () => {
  const slides = new DrizzleSlideRepository()

  test('every slide is listed in order', async () => {
    const first = await slides.create(makeSlide({ id: 0, imageKey: 'slides/550e8400-e29b-41d4-a716-446655440001.png', sortOrder: 2 }))
    const second = await slides.create(makeSlide({ id: 0, imageKey: 'slides/550e8400-e29b-41d4-a716-446655440002.png', sortOrder: 1 }))

    expect((await slides.findAll()).map((slide) => slide.id)).toEqual([second.id, first.id])
  })

  test('two slides cannot share one image', async () => {
    await slides.create(makeSlide({ id: 0 }))

    await expect(slides.create(makeSlide({ id: 0 }))).rejects.toMatchObject({ code: 'DUPLICATE' })
  })

  test('a slide cannot be moved onto another slide\'s image', async () => {
    await slides.create(makeSlide({ id: 0 }))
    const other = await slides.create(makeSlide({ id: 0, imageKey: 'slides/550e8400-e29b-41d4-a716-446655440009.png' }))

    const attempt = slides.update(makeSlide({ id: other.id, imageKey: makeSlide().imageKey }))

    await expect(attempt).rejects.toMatchObject({ code: 'DUPLICATE' })
  })

  test('updating a slide that is gone is not found', async () => {
    await expect(slides.update(makeSlide({ id: 9999 }))).rejects.toBeInstanceOf(DomainNotFoundError)
  })
})

describe('members', () => {
  const members = new DrizzleMemberRepository()

  test('a phone number can belong to one member only, on create and on update', async () => {
    await members.create(member({ phone: '0811111111' }))
    const other = await members.create(member({ phone: '0822222222' }))

    await expect(members.create(member({ phone: '0811111111' }))).rejects.toBeInstanceOf(DomainConflictError)
    await expect(members.update(member({ id: other.id, phone: '0811111111' }))).rejects.toBeInstanceOf(DomainConflictError)
  })

  test('updating a member that is gone is not found', async () => {
    await expect(members.update(member({ id: 9999 }))).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' })
  })
})

describe('tables', () => {
  const tables = new DrizzleTableRepository()

  test('a table name is unique in its branch, also when a table is renamed', async () => {
    await tables.create(makeTable({ id: 0, name: 'T1' }))
    const second = await tables.create(makeTable({ id: 0, name: 'T2' }))

    await expect(tables.update(makeTable({ id: second.id, name: 'T1' }))).rejects.toBeInstanceOf(DomainConflictError)
  })

  test('updating a table that is gone is not found', async () => {
    await expect(tables.update(makeTable({ id: 9999 }))).rejects.toMatchObject({ code: 'TABLE_NOT_FOUND' })
  })
})

describe('modifiers', () => {
  const modifiers = new DrizzleModifierRepository()

  test('a group is read back with its options', async () => {
    const group = await modifiers.createGroup(makeModifierGroup({ id: 0, name: 'ความหวาน' }))
    await modifiers.createOption(makeModifierOption({ id: 0, groupId: group.id, name: 'หวานน้อย' }))

    const view = await modifiers.findGroupView(group.id)

    expect(view?.options.map((option) => option.name)).toEqual(['หวานน้อย'])
    expect((await modifiers.findAllGroups()).map((entry) => entry.group.id)).toEqual([group.id])
    expect(await modifiers.findGroupView(9999)).toBeNull()
  })

  test('group names are unique, also when a group is renamed', async () => {
    await modifiers.createGroup(makeModifierGroup({ id: 0, name: 'A' }))
    const second = await modifiers.createGroup(makeModifierGroup({ id: 0, name: 'B' }))

    await expect(modifiers.createGroup(makeModifierGroup({ id: 0, name: 'A' }))).rejects.toBeInstanceOf(DomainConflictError)
    await expect(modifiers.updateGroup(makeModifierGroup({ id: second.id, name: 'A' }))).rejects.toBeInstanceOf(DomainConflictError)
  })

  test('an option name is unique in its group, also when it is renamed', async () => {
    const group = await modifiers.createGroup(makeModifierGroup({ id: 0, name: 'A' }))
    await modifiers.createOption(makeModifierOption({ id: 0, groupId: group.id, name: 'x' }))
    const second = await modifiers.createOption(makeModifierOption({ id: 0, groupId: group.id, name: 'y' }))

    await expect(modifiers.updateOption(makeModifierOption({ id: second.id, groupId: group.id, name: 'x' }))).rejects.toBeInstanceOf(DomainConflictError)
  })

  test('updating a group or an option that is gone is not found', async () => {
    await expect(modifiers.updateGroup(makeModifierGroup({ id: 9999 }))).rejects.toMatchObject({ code: 'MODIFIER_GROUP_NOT_FOUND' })
    await expect(modifiers.updateOption(makeModifierOption({ id: 9999 }))).rejects.toMatchObject({ code: 'MODIFIER_OPTION_NOT_FOUND' })
  })
})

describe('promotions', () => {
  const promotions = new DrizzlePromotionRepository()

  test('a promotion name is unique ignoring case, also when a promotion is renamed', async () => {
    await promotions.create(promotion({ name: 'Summer' }))
    const second = await promotions.create(promotion({ name: 'Winter' }))

    await expect(promotions.update(promotion({ id: second.id, name: 'summer' }))).rejects.toMatchObject({ code: 'PROMOTION_NAME_TAKEN' })
  })

  test('the image key is written on its own, and an unknown promotion is not found', async () => {
    const created = await promotions.create(promotion())

    const withImage = await promotions.setImageKey(created.id, `promotions/${created.id}/a.png`)

    expect(withImage.imageKey).toBe(`promotions/${created.id}/a.png`)
    await expect(promotions.setImageKey(9999, null)).rejects.toMatchObject({ code: 'PROMOTION_NOT_FOUND' })
  })
})
