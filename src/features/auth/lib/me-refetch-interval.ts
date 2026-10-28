const SIGNED_IN_REFRESH_MS = 30_000

/**
 * How often the signed-in user is re-read: on a timer only while someone is signed in. A query that has never had
 * data goes back to pending on every refetch, which swaps the page for the loading skeleton and wipes whatever was
 * typed into the login or first-run setup form.
 */
export const meRefetchInterval = (query: { state: { data: unknown } }) => (query.state.data ? SIGNED_IN_REFRESH_MS : false)
