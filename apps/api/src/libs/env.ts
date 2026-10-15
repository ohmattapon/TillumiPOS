import { resolveCheckoutMode } from './checkout-mode'
import { resolveMediaStorage } from './media-storage-mode'

const required = (key: string) => {
  const value = Bun.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

export const env = {
  port: Number(Bun.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  // Where product images live: local (this machine's disk), worker (apps/media on R2) or none.
  mediaStorage: resolveMediaStorage(),
  mediaDir: Bun.env.MEDIA_DIR || './data/media',
  // Image Worker (apps/media), used when MEDIA_STORAGE=worker (or when it is left unset and both are set).
  // The trailing slash is dropped so keys can be appended.
  mediaUrl: (Bun.env.MEDIA_URL ?? '').replace(/\/+$/, '') || null,
  mediaToken: Bun.env.MEDIA_TOKEN || null,
  cookieSecure: Bun.env.COOKIE_SECURE === 'true',
  checkoutMode: resolveCheckoutMode(),
}
