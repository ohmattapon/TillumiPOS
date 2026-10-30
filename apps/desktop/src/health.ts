const HEALTH_PATH = '/api/v1/health'
const PROBE_TIMEOUT_MS = 3000

/**
 * True when the shop's API answers its health route with `{ status: 'ok' }`. Any error, a
 * slow answer or a different body counts as not ready, so a stranger on the port never passes.
 */
export async function isShopHealthy(shopOrigin: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(`${shopOrigin}${HEALTH_PATH}`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (!response.ok) return false
    const body: unknown = await response.json()
    return typeof body === 'object' && body !== null && (body as { status?: unknown }).status === 'ok'
  } catch {
    return false
  }
}
