import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query'

/**
 * Forgets the signed-in user after logout. The user query is set to `null` rather than removed: removing it
 * (as `queryClient.clear()` does) leaves the app shell's mounted observer holding the old user, so the screen
 * never leaves the till. Every other query is dropped so the next user never sees the previous user's data.
 */
export function forgetSession(queryClient: QueryClient, meKey: QueryKey) {
  queryClient.setQueryData(meKey, null)
  const meHash = hashKey(meKey)
  queryClient.removeQueries({ predicate: (query) => query.queryHash !== meHash })
}
