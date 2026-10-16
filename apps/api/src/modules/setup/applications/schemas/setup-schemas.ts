import { z } from 'zod'
import { SHOP_TYPES } from '../../../../domains/shop-settings.domain'
import { createUserSchema } from '../../../users/applications/schemas/user-schemas'

export const completeSetupSchema = z.object({
  setupCode: z.string().min(1).max(64),
  shopName: z.string().trim().min(1).max(100),
  branchName: z.string().trim().min(1).max(100),
  username: createUserSchema.shape.username,
  displayName: z.string().trim().min(1).max(100),
  // Longer than the 8 an owner may later give a cashier: this account can do everything.
  password: z.string().min(10).max(72),
  // Optional so a client that does not ask keeps getting every feature, as before.
  shopType: z.enum(SHOP_TYPES).default('other'),
})
