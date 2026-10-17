import { useEffect, useState } from 'react'

/** True once the pointer has been still for `afterMs`, so the cursor can be hidden from the customer. */
export function useIdleCursor(afterMs: number) {
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), afterMs)
    const wake = () => {
      setIdle(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), afterMs)
    }
    window.addEventListener('mousemove', wake)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('mousemove', wake)
    }
  }, [afterMs])

  return idle
}

/** Whether the window is full screen, and a way to enter it (browsers only allow it from a click). */
export function useFullscreen() {
  const [active, setActive] = useState(() => document.fullscreenElement !== null)

  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const enter = () => {
    if (document.fullscreenElement === null) void document.documentElement.requestFullscreen().catch(() => {})
  }

  return { active, enter }
}
