import { hashKey, type Query, type QueryClient, type QueryKey } from '@tanstack/react-query'

const startsWith = (query: Query, prefix: QueryKey) => hashKey(query.queryKey.slice(0, prefix.length)) === hashKey(prefix)

/**
 * Another person takes over the till after a PIN switch. Every cached query of the last person is dropped so
 * nothing of their data shows, then the user is fetched again. The signed-in user and the shop-wide queries
 * (`shopKeys`, such as the shop settings) are kept and only refetched: dropping the settings would flash the
 * default language and shop name. Unlike `forgetSession` the user query is never set to `null`, so the app
 * shell never shows the login page. The cart is not touched: it is in a zustand store, and the sale goes on.
 */
export async function handOverSession(queryClient: QueryClient, meKey: QueryKey, shopKeys: readonly QueryKey[]) {
  const kept = (query: Query) => startsWith(query, meKey) || shopKeys.some((key) => startsWith(query, key))
  queryClient.removeQueries({ predicate: (query) => !kept(query) })
  await queryClient.invalidateQueries({ predicate: kept })
}

/**
 * Runs after the server accepted the PIN. The till's own state moves to the new person first (synchronously),
 * so by the time the refetched user makes the screen recompute from `me.id`, their register is already set.
 */
export async function completeHandOver(
  queryClient: QueryClient,
  meKey: QueryKey,
  shopKeys: readonly QueryKey[],
  newUserId: number,
  onHandOver: (newUserId: number) => void,
) {
  onHandOver(newUserId)
  await handOverSession(queryClient, meKey, shopKeys)
}
