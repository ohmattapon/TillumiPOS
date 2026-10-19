export type MediaStorageMode = 'local' | 'worker' | 'none'

interface MediaStorageInput {
  MEDIA_STORAGE?: string
  MEDIA_URL?: string
  MEDIA_TOKEN?: string
}

/** A token copied unchanged from .env.example is not a secret: treat it as absent everywhere. */
export function liveMediaToken(value: string | undefined): string | null {
  if (!value || value === 'change-me' || value.startsWith('your-')) return null
  return value
}

/**
 * Where product images are kept. Not set: the image Worker when its URL and token are both there (a shop
 * that already uses it changes nothing), otherwise the shop's own disk.
 */
export function resolveMediaStorage(
  input: MediaStorageInput = { MEDIA_STORAGE: Bun.env.MEDIA_STORAGE, MEDIA_URL: Bun.env.MEDIA_URL, MEDIA_TOKEN: Bun.env.MEDIA_TOKEN },
): MediaStorageMode {
  const hasWorker = Boolean(input.MEDIA_URL) && liveMediaToken(input.MEDIA_TOKEN) !== null
  const value = input.MEDIA_STORAGE
  if (value === undefined || value === '') return hasWorker ? 'worker' : 'local'
  if (value === 'worker' && !hasWorker) throw new Error('MEDIA_STORAGE=worker needs both MEDIA_URL and MEDIA_TOKEN')
  if (value === 'local' || value === 'worker' || value === 'none') return value
  throw new Error('MEDIA_STORAGE must be local, worker or none')
}
