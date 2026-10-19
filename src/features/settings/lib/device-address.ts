export type DeviceAddress = { kind: 'ok'; url: string } | { kind: 'needs-ip' } | { kind: 'invalid' }

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i

const isIpv4 = (host: string) => {
  const match = IPV4.exec(host)
  return match !== null && match.slice(1).every((part) => Number(part) <= 255)
}

/**
 * The address another device on the shop network types to reach this till. When the page was opened
 * through a real address (a LAN IP or a domain) that same address works for every device; when it was
 * opened as localhost it means nothing to another device, so the owner types the computer's IP, which the
 * installer prints. A port typed with the IP wins, otherwise the page's own port is kept.
 */
export function deviceAddress(typed: string, origin: string): DeviceAddress {
  const here = new URL(origin)
  const cleaned = typed.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')

  if (cleaned === '') return LOCAL_HOSTS.has(here.hostname) ? { kind: 'needs-ip' } : { kind: 'ok', url: here.origin }

  const [host = '', port, ...rest] = cleaned.split(':')
  if (rest.length > 0 || LOCAL_HOSTS.has(host.toLowerCase())) return { kind: 'invalid' }
  // Digits and dots only is an IP, so 192.168.1.300 is a mistake, not a host name.
  if (!(isIpv4(host) || (!/^[\d.]+$/.test(host) && HOSTNAME.test(host)))) return { kind: 'invalid' }
  if (port !== undefined && !(/^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535)) return { kind: 'invalid' }

  const usedPort = port ?? here.port
  return { kind: 'ok', url: `http://${host}${usedPort ? `:${usedPort}` : ''}` }
}
