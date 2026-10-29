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

/**
 * Throws unless the URL points at this machine and at a database whose name starts with `pos_load`.
 * Accepted: 127.0.0.1 or localhost only ([::1] is refused: the runner and the brief name two hosts, and fewer is safer).
 * A query string or fragment is refused outright, because a driver may read host, hostaddr or dbname from it and
 * connect somewhere other than the host that was checked. The name is compared exactly as written: no case folding,
 * no percent-decoding, no second path segment.
 */
export function assertLoadDatabase(url: string): void {
  const parsed = parse(url, 'database URL')
  if (url.includes('?')) throw new Error('Refusing a database URL with a query string: it could override the host or the database (query rule)')
  if (url.includes('#')) throw new Error('Refusing a database URL with a fragment (fragment rule)')
  if (!LOCAL_HOSTS.has(parsed.hostname))
    throw new Error(`Refusing the database host "${parsed.hostname}": the load test only runs against 127.0.0.1 or localhost (host rule)`)
  assertLoadDatabaseName(parsed.pathname.replace(/^\//, ''))
}

/** Throws unless the name starts with `pos_load` and holds only a-z, 0-9 and _; for a handle whose URL is unknown. */
export function assertLoadDatabaseName(name: string): void {
  if (!/^pos_load[a-z0-9_]*$/.test(name))
    throw new Error(`Refusing the database name "${name}": it must start with ${LOAD_DATABASE_PREFIX} and hold only a-z, 0-9 and _ (database name rule)`)
}

/** Throws unless the URL is this machine's own address, so a script can never hit a real shop. */
export function assertLocalBaseUrl(url: string): void {
  const parsed = parse(url, 'base URL')
  if (parsed.protocol !== 'http:' || !LOCAL_HOSTS.has(parsed.hostname))
    throw new Error(`Refusing the base URL host "${parsed.hostname}": only http://127.0.0.1 or http://localhost is allowed (local base URL rule)`)
}
