import { useEffect, useRef } from 'react'
import { isChannelSupported, openBroadcastChannel } from '../lib/channel'
import type { DisplayView } from '../lib/display-state'
import { DisplayPublisher } from '../lib/publisher'

/**
 * Keeps every customer screen on this computer showing `view`. Call it from the till with what is on the
 * counter now; it sends only when the view changes, and tells the screens to go idle when the till closes.
 */
export function useCustomerDisplayPublisher(view: DisplayView) {
  const publisher = useRef<DisplayPublisher | null>(null)

  useEffect(() => {
    if (!isChannelSupported()) return
    const channel = openBroadcastChannel()
    const instance = new DisplayPublisher({ channel, sessionId: crypto.randomUUID() })
    instance.start()
    publisher.current = instance
    const leave = () => instance.leave()
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('pagehide', leave)
      instance.leave()
      instance.stop()
      channel.close()
      publisher.current = null
    }
  }, [])

  // The view is rebuilt on every render; only a change of its content is worth a message.
  const serialized = JSON.stringify(view)
  useEffect(() => {
    publisher.current?.update(JSON.parse(serialized) as DisplayView)
  }, [serialized])
}
