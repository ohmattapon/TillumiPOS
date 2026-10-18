import { describe, expect, test } from 'bun:test'
import { groupMembersByRole } from './group-members-by-role'

const roles = [
  { id: 1, name: 'Owner' },
  { id: 2, name: 'Cashier' },
]

const users = [
  { id: 11, roleId: 2 },
  { id: 12, roleId: 1 },
  { id: 13, roleId: 2 },
]

describe('groupMembersByRole', () => {
  test('returns one group per role in roles-list order with matching members', () => {
    const groups = groupMembersByRole(users, roles)
    expect(groups.map((group) => group.role?.id)).toEqual([1, 2])
    expect(groups[0]?.members.map((member) => member.id)).toEqual([12])
    expect(groups[1]?.members.map((member) => member.id)).toEqual([11, 13])
  })

  test('members whose roleId matches no role collect in a trailing unassigned group', () => {
    const groups = groupMembersByRole([...users, { id: 14, roleId: 99 }], roles)
    expect(groups).toHaveLength(3)
    expect(groups[2]?.role).toBeNull()
    expect(groups[2]?.members.map((member) => member.id)).toEqual([14])
  })

  test('omits the unassigned group when every member matches a role', () => {
    expect(groupMembersByRole(users, roles)).toHaveLength(2)
  })

  test('keeps an empty role card and drops nothing with no members at all', () => {
    const groups = groupMembersByRole([], roles)
    expect(groups).toHaveLength(2)
    expect(groups.every((group) => group.members.length === 0)).toBe(true)
  })
})
