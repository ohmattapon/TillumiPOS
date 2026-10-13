import { QueryClient } from '@tanstack/react-query'

/** Server state lives here and nowhere else: features read it with queries and change it with mutations. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A till reads the same lists constantly; half a minute of reuse avoids a request per navigation.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})
