const publicPaths = new Set([
  '/api/v1/customer-display/sessions',
  '/api/v1/customer-display/stream',
  '/api/v1/display-slides',
])

/** Retain only endpoint paths so a failed browser check cannot print a session token. */
export function createCustomerDisplayRequestGuard() {
  const unexpected: string[] = []
  return {
    record(rawUrl: string) {
      let path: string
      try {
        path = new URL(rawUrl).pathname
      } catch {
        unexpected.push('[invalid URL]')
        return
      }
      if (path.startsWith('/api/') && !publicPaths.has(path)) unexpected.push(path)
    },
    assertPublicOnly() {
      if (unexpected.length > 0)
        throw new Error(`The customer screen called the API: ${unexpected[0]}`)
    },
  }
}
