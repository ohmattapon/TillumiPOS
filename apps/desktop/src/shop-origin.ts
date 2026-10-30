const DEFAULT_SHOP_ORIGIN = 'http://127.0.0.1:3000'
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost'])

export type NavigationDecision = 'allow' | 'external' | 'deny'

function tryParse(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

/**
 * The only origin the app window may load. It comes from TILLUMI_SHOP_URL, so it is checked
 * as strictly as a URL from the web: plain http on a loopback host with an explicit port, and
 * nothing else (no path, query, fragment or credentials). `undefined` means the default;
 * an empty or malformed value throws, so a typo never silently loads another site.
 */
export function parseShopOrigin(raw: string | undefined): string {
  if (raw === undefined) return DEFAULT_SHOP_ORIGIN

  const url = tryParse(raw)
  if (!url) throw new Error('TILLUMI_SHOP_URL is not a valid URL')
  if (url.protocol !== 'http:') throw new Error('TILLUMI_SHOP_URL must start with http://')
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('TILLUMI_SHOP_URL must point to 127.0.0.1 or localhost')
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('TILLUMI_SHOP_URL must not contain credentials')
  }
  // A bare "?" or "#" leaves search and hash empty, so the raw text is checked too.
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '' || /[?#]/.test(raw)) {
    throw new Error('TILLUMI_SHOP_URL must be an origin only, without a path or query')
  }
  // The URL parser drops a default port (":80"), so an empty port means none was usable.
  const port = Number(url.port)
  if (url.port === '' || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('TILLUMI_SHOP_URL must include a port')
  }
  return url.origin
}

/** True only when `url` parses to exactly the shop origin. Malformed input is never the shop. */
export function isShopUrl(shopOrigin: string, url: string): boolean {
  return navigationDecision(shopOrigin, url) === 'allow'
}

/**
 * What to do with a navigation or a new window:
 * allow = stay inside the app, external = hand to the system browser, deny = drop it.
 * Only http and https can ever be external or allowed; `blob:` is checked by scheme first
 * because its origin is the origin of the page that made it.
 */
export function navigationDecision(shopOrigin: string, url: string): NavigationDecision {
  const target = tryParse(url)
  if (!target) return 'deny'
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return 'deny'

  const shop = tryParse(shopOrigin)
  if (shop && shop.protocol === 'http:' && target.origin === shop.origin) return 'allow'
  return 'external'
}
