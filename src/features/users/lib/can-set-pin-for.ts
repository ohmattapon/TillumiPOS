/**
 * Whether the users page offers "Set PIN" for this row. An owner's PIN is set only by that owner, and one's own
 * PIN only from the account menu, which asks for the password; anyone else's by whoever may manage users.
 */
export const canSetPinFor = (target: { id: number; role: string }, me: { id: number }): boolean =>
  target.role !== 'owner' && target.id !== me.id
