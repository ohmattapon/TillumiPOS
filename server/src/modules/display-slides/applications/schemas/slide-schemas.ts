import { z } from 'zod'

/** The 5 MB ceiling mirrors the product image rule; it lives here (not in an adapter) so the use case can reject oversized files in unit tests without touching disk or network. */
export const MAX_SLIDE_IMAGE_BYTES = 5 * 1024 * 1024

const sortOrder = z.number().int().min(0)

// z.object() drops unknown keys, so callers cannot set id or imageKey: the key is minted by the upload.
export const uploadSlideImageSchema = z.object({
  file: z.instanceof(Blob),
  sortOrder: sortOrder.optional(),
  isActive: z.boolean().optional(),
})

export const updateSlideSchema = z
  .object({
    sortOrder,
    isActive: z.boolean(),
  })
  .partial()

export const slideIdSchema = z.number().int().min(1)
