import { Container, getContainer } from '@cloudflare/containers'

/** The Docker image of the API, which also serves the built web app (WEB_DIST). */
export class PosApp extends Container<Env> {
  defaultPort = 3000
  // Sleeping saves money; the first request after it waits a few seconds for the API to start again.
  sleepAfter = '30m'

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env)
    this.envVars = {
      DATABASE_URL: env.DATABASE_URL,
      JWT_SECRET: env.JWT_SECRET,
      MEDIA_STORAGE: 'worker',
      MEDIA_URL: env.MEDIA_URL,
      MEDIA_TOKEN: env.MEDIA_TOKEN,
      // Served over https by Workers, so the session cookie can require it.
      COOKIE_SECURE: 'true',
    }
  }
}

export default {
  async fetch(request, env) {
    // Always the same instance: the API keeps the customer display sessions in memory.
    return getContainer(env.POS_APP, 'main').fetch(request)
  },
} satisfies ExportedHandler<Env>
