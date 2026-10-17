import { ShiftEntity, type ShiftProps } from '../../../domains/shift.domain'
import { ShiftCashEntryEntity, type ShiftCashEntryProps } from '../../../domains/shift-cash-entry.domain'

/** JSONB turns dates into ISO strings; restore the domain's date fields before replaying a command. */
export function restoreShiftSnapshot(value: unknown): ShiftEntity {
  const snapshot = value as Omit<ShiftProps, 'openedAt' | 'closingStartedAt' | 'closedAt'> & {
    openedAt: string | Date
    closingStartedAt: string | Date | null
    closedAt: string | Date | null
  }
  return new ShiftEntity({
    ...snapshot,
    openedAt: new Date(snapshot.openedAt),
    closingStartedAt: snapshot.closingStartedAt === null ? null : new Date(snapshot.closingStartedAt),
    closedAt: snapshot.closedAt === null ? null : new Date(snapshot.closedAt),
  })
}

export function restoreCashEntrySnapshot(value: unknown): ShiftCashEntryEntity {
  const snapshot = value as Omit<ShiftCashEntryProps, 'createdAt'> & { createdAt: string | Date }
  return new ShiftCashEntryEntity({ ...snapshot, createdAt: new Date(snapshot.createdAt) })
}
