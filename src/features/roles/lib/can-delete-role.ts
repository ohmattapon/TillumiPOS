/** Delete-disable rule shared by the role card menu: system roles and roles with users cannot be deleted. */
export const canDeleteRole = (role: { systemKey: string | null; userCount: number }): boolean =>
  !role.systemKey && role.userCount <= 0
