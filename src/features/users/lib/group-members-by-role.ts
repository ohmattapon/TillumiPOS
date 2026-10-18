export interface RoleMemberGroup<TRole, TMember> {
  /** Null collects members whose roleId matches no known role. */
  role: TRole | null
  members: TMember[]
}

/**
 * Groups members under their role, following the roles-list order so cards render deterministically.
 * Members whose roleId matches no role collect in a single trailing unassigned group (omitted when empty).
 */
export function groupMembersByRole<TMember extends { roleId: number }, TRole extends { id: number }>(
  users: readonly TMember[],
  roles: readonly TRole[],
): Array<RoleMemberGroup<TRole, TMember>> {
  const known = new Set(roles.map((role) => role.id))
  const byRole = new Map<number, TMember[]>()
  const unassigned: TMember[] = []
  for (const user of users) {
    if (known.has(user.roleId)) {
      const members = byRole.get(user.roleId)
      if (members) members.push(user)
      else byRole.set(user.roleId, [user])
    } else {
      unassigned.push(user)
    }
  }
  const groups: Array<RoleMemberGroup<TRole, TMember>> = roles.map((role) => ({ role, members: byRole.get(role.id) ?? [] }))
  if (unassigned.length > 0) groups.push({ role: null, members: unassigned })
  return groups
}
