import { useEffect, useState } from 'react'

/** Wait for a pause in typing before requesting a filtered server page. */
export function useDebouncedValue(value: string, delay = 200) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}
