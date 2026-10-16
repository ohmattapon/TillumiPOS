import type { Branch } from '@pos/api/types'
import { describe, expect, test } from 'bun:test'
import { pickBranch } from './pick-branch'

const branch = (id: number, overrides: Partial<Branch> = {}): Branch => ({
  id,
  code: `B${id}`,
  name: `สาขา ${id}`,
  address: null,
  phone: null,
  isActive: true,
  ...overrides,
})

const owner = { role: 'owner' as const, branchId: 1 }
const cashier = { role: 'cashier' as const, branchId: 2 }
const all = [branch(1), branch(2), branch(3)]

describe('pickBranch', () => {
  test('a custom role may switch only while branches.switch remains granted', () => {
    const manager = { ...cashier, permissions: ['branches.switch'] as const }
    expect(pickBranch(manager, all, 3)).toEqual({ branch: all[2], chosenIsUsable: true })
    expect(pickBranch({ ...manager, permissions: [] }, all, 3)).toEqual({ branch: all[1], chosenIsUsable: false })
  })
  test('without a choice, the user works in their own branch', () => {
    expect(pickBranch(owner, all, null)).toEqual({ branch: all[0], chosenIsUsable: true })
    expect(pickBranch(cashier, all, null).branch).toBe(all[1])
  })

  test('an owner works in the branch they chose', () => {
    expect(pickBranch(owner, all, 3)).toEqual({ branch: all[2], chosenIsUsable: true })
  })

  test('a closed branch cannot be chosen, and the owner falls back to their own', () => {
    const branches = [branch(1), branch(2), branch(3, { isActive: false })]

    expect(pickBranch(owner, branches, 3)).toEqual({ branch: branches[0], chosenIsUsable: false })
  })

  test('a branch that is no longer in the list is not usable', () => {
    expect(pickBranch(owner, [branch(1)], 7)).toEqual({ branch: expect.objectContaining({ id: 1 }), chosenIsUsable: false })
  })

  test('a cashier never works in another branch, whatever was remembered', () => {
    expect(pickBranch(cashier, all, 3)).toEqual({ branch: all[1], chosenIsUsable: false })
  })

  test('before the list arrives there is no branch yet', () => {
    expect(pickBranch(owner, [], null).branch).toBeUndefined()
  })
})
