import { DomainNotFoundError } from '../../../domains/errors/domain-not-found.error'
import type { IRoleDirectory, RoleRef } from './ports/role-directory.port'

export async function resolveRole(
  roles: IRoleDirectory,
  input: { roleId?: number; role?: 'owner' | 'cashier' },
): Promise<RoleRef> {
  if (input.roleId !== undefined) {
    const found = await roles.findById(input.roleId)
    if (!found) throw new DomainNotFoundError('ไม่พบบทบาท', 'ROLE_NOT_FOUND')
    return found
  }
  return roles.findBySystemKey(input.role!)
}
