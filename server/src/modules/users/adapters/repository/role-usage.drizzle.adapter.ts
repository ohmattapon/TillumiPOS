import { count, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { users } from '../../../../infrastructure/database/schema/users'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IRoleUsage } from '../../../roles/applications/ports/role-usage.port'
@injectable()
export class DrizzleRoleUsage implements IRoleUsage {
  async countUsers(roleId: number) {
    const [result] = await currentExecutor().select({ value: count() }).from(users).where(eq(users.roleId, roleId))
    return result!.value
  }
}
