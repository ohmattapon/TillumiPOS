import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  // DATABASE_URL comes from the repo-root .env via the --env-file flag in package.json.
  dbCredentials: { url: process.env.DATABASE_URL! },
})
