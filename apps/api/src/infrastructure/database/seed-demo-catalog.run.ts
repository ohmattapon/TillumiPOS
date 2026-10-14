import 'reflect-metadata'
import { and, asc, eq } from 'drizzle-orm'
import '../../modules/di-registrations'
import { branches } from './schema/branches'
import { users } from './schema/users'
import { db, client } from '../../libs/db'
import { seedDemoProductCatalog } from './seed-demo-product-catalog'

try {
  const [owner] = await db
    .select({ id: users.id, branchId: users.branchId })
    .from(users)
    .innerJoin(branches, eq(users.branchId, branches.id))
    .where(and(eq(users.role, 'owner'), eq(users.isActive, true), eq(branches.isActive, true)))
    .orderBy(asc(users.id))
    .limit(1)

  if (!owner) throw new Error('Create or set up an owner account before importing the demo catalog')
  await seedDemoProductCatalog(owner.id, owner.branchId)
} finally {
  await client.close()
}
