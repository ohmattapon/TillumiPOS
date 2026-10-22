import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/src/infrastructure/database/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  // drizzle-kit cannot use Bun's SQL client, so migrate and studio connect through the `postgres` devDependency.
  // Run from the repo root. DATABASE_URL comes from the root .env via the --env-file flag in package.json.
  dbCredentials: { url: process.env.DATABASE_URL! },
})
