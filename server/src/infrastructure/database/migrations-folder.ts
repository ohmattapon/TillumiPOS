import { fileURLToPath } from 'node:url'

/**
 * The repo-root drizzle/ folder, found from this file rather than the working directory: migrations run from the
 * root (bun run db:migrate), from server/ (tests) and from /repo/server in the install image.
 */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../../drizzle', import.meta.url))
