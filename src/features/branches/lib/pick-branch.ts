import type { Branch, User } from '@pos/api/types'
import { canDo, isPermission } from '@pos/api/permissions'

export interface BranchChoice {
  /** The branch requests are made for; undefined while the list has not arrived. */
  branch: Branch | undefined
  /** Whether the remembered choice can be used. When false it should be forgotten. */
  chosenIsUsable: boolean
}

/**
 * Decides which branch the till works in. Only an owner may choose, and only an open branch they can
 * see; anything else (a branch closed since last time, a cashier's stale choice) falls back to the
 * branch the user belongs to.
 */
export function pickBranch(
  user: Pick<User, 'role' | 'branchId'> & { permissions?: readonly string[] },
  branches: readonly Branch[],
  chosen: number | null,
): BranchChoice {
  const own = branches.find((branch) => branch.id === user.branchId)
  if (chosen === null) return { branch: own, chosenIsUsable: true }

  const usable = canDo({ role: user.role, permissions: user.permissions?.filter(isPermission) }, 'branches.switch') ? branches.find((branch) => branch.id === chosen && branch.isActive) : undefined
  return { branch: usable ?? own, chosenIsUsable: usable !== undefined }
}
