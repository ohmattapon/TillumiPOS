// The guards that keep a load run away from anything but a throwaway local database and this machine's own API.
// Messages name the rule broken but never repeat the URL, because a connection string carries a password.

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])
const LOAD_DATABASE_PREFIX = 'pos_load'

function parse(url: string, what: string): URL {
  try {
    return new URL(url)
  } catch {
    throw new Error(`The ${what} is not a valid URL`)
  }
}

/** Throws unless the URL points at this machine and at a database whose name starts with `pos_load`. */
export function assertLoadDatabase(url: string): void {
  const parsed = parse(url, 'database URL')
  if (!LOCAL_HOSTS.has(parsed.hostname))
    throw new Error(`Refusing the database host "${parsed.hostname}": the load test only runs against 127.0.0.1 or localhost (host rule)`)
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  if (!name.startsWith(LOAD_DATABASE_PREFIX))
    throw new Error(`Refusing the database name "${name}": the database name must start with ${LOAD_DATABASE_PREFIX} (database name rule)`)
}

/** Throws unless the URL is this machine's own address, so a script can never hit a real shop. */
export function assertLocalBaseUrl(url: string): void {
  const parsed = parse(url, 'base URL')
  if (parsed.protocol !== 'http:' || !LOCAL_HOSTS.has(parsed.hostname))
    throw new Error(`Refusing the base URL host "${parsed.hostname}": only http://127.0.0.1 or http://localhost is allowed (local base URL rule)`)
}
