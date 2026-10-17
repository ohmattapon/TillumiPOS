import type { DisplayTarget } from '../../../domains/display-session.domain'

/** Who works the till: the person, and the branch the request works in. */
export interface DisplayActor {
  userId: number
  branchId: number
}

/** The register the till names, or the branch itself when it names none. */
export const targetOf = (actor: DisplayActor, registerId: number | null | undefined): DisplayTarget => ({
  branchId: actor.branchId,
  registerId: registerId ?? null,
})
