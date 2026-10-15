/** Stable filters, including branchId and pagination, name a cached read. */
export const cacheKey = (query: object) => JSON.stringify(Object.entries(query)
  .filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)))
