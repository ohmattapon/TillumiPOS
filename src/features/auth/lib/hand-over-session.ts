import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query'

/**
 * Another person takes over the till after a PIN switch. Every cached query except the signed-in user is
 * dropped so nothing of the last person's data shows, then the user is fetched again. Unlike `forgetSession`
 * the user query is never set to `null`, so the app shell never shows the login page. The cart is not
 * touched: it is in a zustand store, and the sale in progress goes on.
 */
export async function handOverSession(queryClient: QueryClient, meKey: QueryKey) {
  const meHash = hashKey(meKey)
  queryClient.removeQueries({ predicate: (query) => query.queryHash !== meHash })
  await queryClient.invalidateQueries({ queryKey: meKey })
}
