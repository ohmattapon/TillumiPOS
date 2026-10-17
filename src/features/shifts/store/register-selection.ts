import { create } from 'zustand'

const STORAGE_KEY = 'pos.register-selection'

function readSelections(): Record<string, number> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) return stored as Record<string, number>
  } catch { /* Ignore an invalid local selection and use the first active register. */ }
  return {}
}

interface RegisterSelectionState {
  selections: Record<string, number>
  select: (userId: number, branchId: number, registerId: number) => void
  clear: () => void
}

export const useRegisterSelectionStore = create<RegisterSelectionState>((set) => ({
  selections: readSelections(),
  select: (userId, branchId, registerId) => set((state) => {
    const selections = { ...state.selections, [`${userId}:${branchId}`]: registerId }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selections))
    return { selections }
  }),
  clear: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ selections: {} })
  },
}))

export function selectedRegisterId(selections: Record<string, number>, userId: number | undefined, branchId: number | undefined) {
  if (userId === undefined || branchId === undefined) return undefined
  return selections[`${userId}:${branchId}`]
}
