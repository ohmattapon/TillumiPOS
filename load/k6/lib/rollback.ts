// Opening several things where a failure part-way must not leave the earlier ones open.

/**
 * Calls `open` for each index in turn. If one throws, `close` runs on everything opened so far (a failing close
 * does not stop the rest) and the original error is thrown again.
 */
export function openAllOrRollBack<T>(count: number, open: (index: number) => T, close: (opened: T) => void): T[] {
  const opened: T[] = []
  try {
    for (let index = 0; index < count; index++) opened.push(open(index))
  } catch (error) {
    for (const item of opened) {
      try {
        close(item)
      } catch {
        // keep closing the others; the open error is the one worth reporting
      }
    }
    throw error
  }
  return opened
}
