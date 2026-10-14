import { z } from 'zod'
import { createUserSchema } from '../../../users/applications/schemas/user-schemas'

export const completeSetupSchema = z.object({
  setupCode: z.string().min(1).max(64),
  shopName: z.string().trim().min(1).max(100),
  branchName: z.string().trim().min(1).max(100),
  username: createUserSchema.shape.username,
  displayName: z.string().trim().min(1).max(100),
  // Longer than the 8 an owner may later give a cashier: this account can do everything.
  password: z.string().min(10).max(72),
})
