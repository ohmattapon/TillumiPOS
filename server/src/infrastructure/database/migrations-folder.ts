import { fileURLToPath } from 'node:url'

/**
 * The repo-root drizzle/ folder, found from this file rather than the working directory: migrations run from the
 * root (bun run db:migrate), from server/ (tests) and from /repo/server in the install image.
 *
 * The native Windows installer (installer/tillumi.iss) ships the folder next to the compiled
 * tillumi-migrate.exe and points here with MIGRATIONS_DIR: inside a `bun build --compile` binary
 * import.meta.url is a virtual path with no drizzle/ beside it, so the relative lookup fails there.
 */
export const MIGRATIONS_FOLDER =
  Bun.env.MIGRATIONS_DIR !== undefined && Bun.env.MIGRATIONS_DIR !== ''
    ? Bun.env.MIGRATIONS_DIR
    : fileURLToPath(new URL('../../../../drizzle', import.meta.url))
