// Which members the points-changing steps of the members scenario may touch. The last members of the seed are
// reserved for it, so no sale (the checkout scenario picks only from `selling`) and no other virtual user moves
// their points, and each virtual user owns one slice of them: its balance checks cannot be disturbed.

/** Virtual users the members scenario can run without two of them sharing a member. */
export const MEMBER_SLICES = 20
const RESERVED_MEMBERS = 200

/** Splits the seeded members into the ones sales may use and the ones reserved for the members scenario. */
export function splitMembers(memberIds: number[]): { selling: number[]; reserved: number[] } {
  const count = Math.min(RESERVED_MEMBERS, Math.floor(memberIds.length / 2))
  return { selling: memberIds.slice(0, memberIds.length - count), reserved: memberIds.slice(memberIds.length - count) }
}

/** The reserved members of virtual user `vu` (1-based): every member whose position matches the user's slice. */
export function sliceFor(reserved: number[], vu: number, slices = MEMBER_SLICES): number[] {
  const slice = reserved.filter((_, index) => index % slices === (vu - 1) % slices)
  if (slice.length === 0) throw new Error(`The seed reserves ${reserved.length} members, too few for ${slices} slices`)
  return slice
}
