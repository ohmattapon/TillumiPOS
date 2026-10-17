import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { meQuery, useCan } from '@/features/auth'
import { useActiveBranchStore } from '@/lib/active-branch'
import { branchesQuery, branchKeys } from '../api'
import { pickBranch } from '../lib/pick-branch'
import { changeWorkingBranch } from '../lib/change-working-branch'

/**
 * The branch the till is working in, and the means to change it. A cashier always works in their own
 * branch; an owner may choose any open one, and the choice survives a reload.
 */
export function useActiveBranch() {
  const canSwitch = useCan('branches.switch')
  const queryClient = useQueryClient()
  const me = useQuery(meQuery).data
  const branches = useQuery(branchesQuery).data
  const chosen = useActiveBranchStore((state) => state.branchId)
  const select = useActiveBranchStore((state) => state.select)
  const priorAccess = useRef({ canSwitch, branchId: me?.branchId })
  useEffect(() => {
    const previous = priorAccess.current
    priorAccess.current = { canSwitch, branchId: me?.branchId }
    if (previous.canSwitch !== canSwitch || previous.branchId !== me?.branchId) {
      void queryClient.invalidateQueries({ queryKey: branchKeys.all })
      void changeWorkingBranch(queryClient, select, null)
    }
  }, [canSwitch, me?.branchId, queryClient, select])

  const open = (branches ?? []).filter((branch) => branch.isActive)
  const { branch, chosenIsUsable } = me
    ? pickBranch(me, branches ?? [], chosen)
    : { branch: undefined, chosenIsUsable: true }

  // A remembered branch that no longer exists, was closed, or is not allowed would fail every request.
  useEffect(() => {
    if (me && branches && chosen !== null && !chosenIsUsable) void changeWorkingBranch(queryClient, select, null)
  }, [me, branches, chosen, chosenIsUsable, select, queryClient])

  /** Changes the branch and drops what was loaded for the old one. */
  const switchTo = (branchId: number) => {
    void changeWorkingBranch(queryClient, select, me && branchId === me.branchId ? null : branchId)
  }

  return { branch, branches: open, canSwitch: canSwitch && open.length > 1, switchTo }
}
