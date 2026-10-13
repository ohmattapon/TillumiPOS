const required = (key: string) => {
  const value = Bun.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

export const env = {
  port: Number(Bun.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  // Image Worker (apps/media); the trailing slash is dropped so keys can be appended.
  mediaUrl: required('MEDIA_URL').replace(/\/+$/, ''),
  mediaToken: required('MEDIA_TOKEN'),
  cookieSecure: Bun.env.COOKIE_SECURE === 'true',
}
