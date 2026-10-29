import { create } from 'zustand'

const STORAGE_KEY = 'pos.register-selection'

export function readSelections(): Record<string, number> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) return stored as Record<string, number>
  } catch { /* Ignore an invalid local selection and use the first active register. */ }
  return {}
}

interface RegisterSelectionState {
  selections: Record<string, number>
  select: (userId: number, registerId: number) => void
  /** Another person takes over this till: the till's current register becomes theirs. */
  handOver: (toUserId: number, registerId: number | undefined) => void
  clear: () => void
}

export const useRegisterSelectionStore = create<RegisterSelectionState>((set) => ({
  selections: readSelections(),
  select: (userId, registerId) => set((state) => {
    const selections = { ...state.selections, [String(userId)]: registerId }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selections))
    return { selections }
  }),
  handOver: (toUserId, registerId) => {
    if (registerId === undefined) return
    set((state) => {
      const selections = { ...state.selections, [String(toUserId)]: registerId }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(selections))
      } catch { /* Storage may be unavailable; the choice still holds for this session. */ }
      return { selections }
    })
  },
  clear: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ selections: {} })
  },
}))

/** The register this user last chose. The shop has one branch, so a user has one register choice. */
export function selectedRegisterId(selections: Record<string, number>, userId: number | undefined) {
  if (userId === undefined) return undefined
  return selections[String(userId)]
}
