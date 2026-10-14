import { resolveCheckoutMode } from './checkout-mode'

const required = (key: string) => {
  const value = Bun.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

export const env = {
  port: Number(Bun.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  // Image Worker (apps/media), optional: without both the shop runs with no product images.
  // The trailing slash is dropped so keys can be appended.
  mediaUrl: (Bun.env.MEDIA_URL ?? '').replace(/\/+$/, '') || null,
  mediaToken: Bun.env.MEDIA_TOKEN || null,
  cookieSecure: Bun.env.COOKIE_SECURE === 'true',
  checkoutMode: resolveCheckoutMode(),
}
