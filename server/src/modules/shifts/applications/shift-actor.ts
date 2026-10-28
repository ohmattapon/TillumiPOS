import type { Actor as PermissionActor } from '../../../domains/authorization'

/** Who is acting on a shift: the permissions they hold, and the name recorded on what they change. */
export interface ShiftActor extends PermissionActor { id: number; displayName: string }
