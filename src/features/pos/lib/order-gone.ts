/** The HTTP status of an error the API client threw, read without importing the browser-bound client. */
const statusOf = (error: unknown): number | undefined =>
  typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
    ? error.status
    : undefined

/** An order the till must leave: the server says it is no longer open, or it does not exist any more. */
export function orderIsGone(order: { error: unknown; data?: { status: string } }): boolean {
  if (statusOf(order.error) === 404) return true

  return order.data !== undefined && order.data.status !== 'open'
}
