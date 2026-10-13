import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { meQuery } from '@/features/auth'
import { useActiveBranchStore } from '@/lib/active-branch'
import { branchesQuery } from '../api'
import { pickBranch } from '../lib/pick-branch'

// Everything that depends on which branch is being worked in. Settings, branches and the session do not.
const BRANCH_INDEPENDENT = new Set(['settings', 'branches', 'auth', 'categories'])

/**
 * The branch the till is working in, and the means to change it. A cashier always works in their own
 * branch; an owner may choose any open one, and the choice survives a reload.
 */
export function useActiveBranch() {
  const queryClient = useQueryClient()
  const me = useQuery(meQuery).data
  const branches = useQuery(branchesQuery).data
  const chosen = useActiveBranchStore((state) => state.branchId)
  const select = useActiveBranchStore((state) => state.select)

  const open = (branches ?? []).filter((branch) => branch.isActive)
  const { branch, chosenIsUsable } = me
    ? pickBranch(me, branches ?? [], chosen)
    : { branch: undefined, chosenIsUsable: true }

  // A remembered branch that no longer exists, was closed, or is not allowed would fail every request.
  useEffect(() => {
    if (me && branches && chosen !== null && !chosenIsUsable) select(null)
  }, [me, branches, chosen, chosenIsUsable, select])

  /** Changes the branch and drops what was loaded for the old one. */
  const switchTo = (branchId: number) => {
    select(me && branchId === me.branchId ? null : branchId)
    void queryClient.resetQueries({ predicate: (query) => !BRANCH_INDEPENDENT.has(String(query.queryKey[0])) })
  }

  return { branch, branches: open, canSwitch: me?.role === 'owner' && open.length > 1, switchTo }
}
