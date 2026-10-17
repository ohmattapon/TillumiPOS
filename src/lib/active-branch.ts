import { create } from 'zustand'

const STORAGE_KEY = 'pos.branch'

function readStored(): number | null {
  const value = Number(localStorage.getItem(STORAGE_KEY))
  return Number.isInteger(value) && value > 0 ? value : null
}

interface ActiveBranchState {
  /** The branch an owner chose to work in. null means "the branch I belong to". */
  branchId: number | null
  select: (branchId: number | null) => void
}

/**
 * Which branch requests are made for. It lives in `lib` because the API client sends it with every
 * request; the features that let someone change it (and react to it) live in `features/branches`.
 */
export const useActiveBranchStore = create<ActiveBranchState>((set) => ({
  branchId: readStored(),
  select: (branchId) => {
    if (branchId === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(branchId))
    set({ branchId })
  },
}))

/** For code outside React, such as the API client. */
export const chosenBranchId = () => useActiveBranchStore.getState().branchId
