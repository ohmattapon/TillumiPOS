import { expect, test } from 'bun:test'
import { MEMBER_SLICES, sliceFor, splitMembers } from './member-slices.ts'

const ids = Array.from({ length: 5000 }, (_, index) => index + 1)

test('the last 200 members are reserved and the sellers never get them', () => {
  const { selling, reserved } = splitMembers(ids)
  expect(reserved).toEqual(ids.slice(-200))
  expect(selling.length).toBe(4800)
  expect(selling.some((id) => reserved.includes(id))).toBe(false)
})

test('a small seed reserves at most half the members', () => {
  const { selling, reserved } = splitMembers([1, 2, 3, 4, 5, 6])
  expect(reserved).toEqual([4, 5, 6])
  expect(selling).toEqual([1, 2, 3])
})

test('the slices of different virtual users never share a member', () => {
  const { reserved } = splitMembers(ids)
  const seen = new Set<number>()
  for (let vu = 1; vu <= MEMBER_SLICES; vu++) {
    const slice = sliceFor(reserved, vu)
    expect(slice.length).toBe(reserved.length / MEMBER_SLICES)
    for (const id of slice) {
      expect(seen.has(id)).toBe(false)
      seen.add(id)
    }
  }
  expect(seen.size).toBe(reserved.length)
})

test('a seed too small to give every slice a member is refused', () => {
  expect(() => sliceFor([1, 2], 5)).toThrow()
})
