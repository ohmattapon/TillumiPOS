/** An owner's PIN is set only by that owner; anyone else's by whoever may manage users. */
export const canSetPinFor = (target: { id: number; role: string }, me: { id: number }): boolean =>
  target.role !== 'owner' || target.id === me.id
