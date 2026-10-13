const required = (key: string) => {
  const value = Bun.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

export const env = {
  port: Number(Bun.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  vatRateBp: Number(Bun.env.VAT_RATE_BP ?? 700),
  // Business day boundary for receipt numbering.
  timeZone: Bun.env.SHOP_TIME_ZONE ?? 'Asia/Bangkok',
  // Image Worker (apps/media); the trailing slash is dropped so keys can be appended.
  mediaUrl: required('MEDIA_URL').replace(/\/+$/, ''),
  mediaToken: required('MEDIA_TOKEN'),
  cookieSecure: Bun.env.COOKIE_SECURE === 'true',
}
