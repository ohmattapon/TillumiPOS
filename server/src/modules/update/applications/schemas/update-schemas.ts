import { z } from 'zod'

// The feed is ours (installer/feed.json published per GitHub Release), so its
// shape is strict: a numeric triple, a 64-hex signature, and an HTTPS package
// URL. Anything else is UPDATE_FEED_INVALID, never trusted.
export const updateFeedSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, { message: 'version must be major.minor.patch' }),
  sha256: z.string().regex(/^[0-9a-fA-F]{64}$/, { message: 'sha256 must be 64 hex characters' }),
  url: z
    .string()
    .url({ message: 'url must be a URL' })
    .refine((url) => url.startsWith('https://'), { message: 'url must be HTTPS' }),
})

export type UpdateFeedInput = z.infer<typeof updateFeedSchema>

// POST /update/apply carries no fields: the feed URL is fixed server-side, so a
// client can never point an update anywhere. Any supplied field is rejected.
export const applyUpdateSchema = z.union([z.undefined(), z.object({}).strict()])
