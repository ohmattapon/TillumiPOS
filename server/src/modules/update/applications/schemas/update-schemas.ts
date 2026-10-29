import { z } from 'zod'
import { UPDATE_RELEASE_URL_PREFIX } from '../../../../domains/update-release'

// The feed is ours (installer/feed.json published per GitHub Release), so its
// shape is strict: a numeric triple, a 64-hex package hash, a package URL under
// our own release path, and a base64 publisher signature. Anything else is
// UPDATE_FEED_INVALID, never trusted. The signature itself is checked by the
// use case, through a port.
export const updateFeedSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, { message: 'version must be major.minor.patch' }),
  sha256: z.string().regex(/^[0-9a-fA-F]{64}$/, { message: 'sha256 must be 64 hex characters' }),
  url: z
    .string()
    .url({ message: 'url must be a URL' })
    .refine((url) => url.startsWith(UPDATE_RELEASE_URL_PREFIX), { message: 'url must be one of our releases' }),
  signature: z
    .string()
    .min(300)
    .max(700)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, { message: 'signature must be base64' }),
})

export type UpdateFeedInput = z.infer<typeof updateFeedSchema>

// POST /update/apply carries no fields: the feed URL is fixed server-side, so a
// client can never point an update anywhere. Any supplied field is rejected.
export const applyUpdateSchema = z.union([z.undefined(), z.object({}).strict()])
