import { useCallback, useState } from 'react'
import { useActiveBranchStore } from '@/lib/active-branch'

/** A changed filter or branch starts at page one without carrying the old offset into a request. */
export function useListPagination(scope = '', pageSize = 20) {
  const branchId = useActiveBranchStore((state) => state.branchId)
  const key = `${branchId ?? 'own'}:${scope}`
  const [selection, setSelection] = useState({ key, page: 0 })
  // Record the new scope too, so returning to an old filter cannot revive its former page number.
  if (selection.key !== key) setSelection({ key, page: 0 })
  const page = selection.key === key ? selection.page : 0
  const setPage = useCallback((next: number) => setSelection({ key, page: Math.max(0, next) }), [key])
  return { page, pageSize, offset: page * pageSize, setPage }
}
