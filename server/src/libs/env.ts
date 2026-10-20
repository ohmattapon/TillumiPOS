import { resolveCheckoutMode } from './checkout-mode'
import { liveMediaToken, resolveMediaStorage } from './media-storage-mode'

const required = (key: string) => {
  const value = Bun.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

/**
 * A secret copied unchanged from .env.example is not a secret: anyone holding the repo can forge
 * sessions or upload images with it. Refuse the known placeholders at startup instead of running
 * with credentials the whole world knows.
 */
const requiredSecret = (key: string) => {
  const value = required(key)
  if (value === 'change-me' || value.startsWith('your-'))
    throw new Error(`${key} still holds a placeholder value from .env.example`)
  return value
}

export const env = {
  port: Number(Bun.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: requiredSecret('JWT_SECRET'),
  // Where product images live: local (this machine's disk), worker (workers/media on R2) or none.
  mediaStorage: resolveMediaStorage(),
  mediaDir: Bun.env.MEDIA_DIR || './data/media',
  // Image Worker (workers/media), used when MEDIA_STORAGE=worker (or when it is left unset and both are set).
  // The trailing slash is dropped so keys can be appended.
  mediaUrl: (Bun.env.MEDIA_URL ?? '').replace(/\/+$/, '') || null,
  mediaToken: liveMediaToken(Bun.env.MEDIA_TOKEN),
  cookieSecure: Bun.env.COOKIE_SECURE === 'true',
  checkoutMode: resolveCheckoutMode(),
}
