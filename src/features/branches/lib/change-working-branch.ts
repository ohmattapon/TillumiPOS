import type { QueryClient } from '@tanstack/react-query'

const BRANCH_INDEPENDENT = new Set(['settings', 'branches', 'auth', 'categories', 'roles', 'audit'])

/** Explicit switching and permission-driven fallback must discard the same branch data. */
export async function changeWorkingBranch(client: QueryClient, select: (id: number | null) => void, id: number | null) {
  select(id)
  await client.resetQueries({ predicate: (query) => !BRANCH_INDEPENDENT.has(String(query.queryKey[0])) })
}
