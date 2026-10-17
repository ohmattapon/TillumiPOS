import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { displayPairingQuery, publishDisplayState } from '../api'
import { isChannelSupported, openBroadcastChannel, type DisplayChannel } from '../lib/channel'
import type { DisplayView } from '../lib/display-state'
import { DisplayPublisher } from '../lib/publisher'
import { combineChannels, createServerSender } from '../lib/server-channel'

/** How often the till asks how many screens follow it: another till may have let them go. */
const PAIRING_REFRESH_MS = 30_000

/**
 * Keeps every customer screen showing `view`: the ones in this browser through the browser channel, and the
 * ones paired to this register through the server. Call it from the till with what is on the counter now; it
 * sends only when the view changes, and tells the screens to go idle when the till closes.
 */
export function useCustomerDisplayPublisher(view: DisplayView, options: { registerId?: number } = {}) {
  const publisher = useRef<DisplayPublisher | null>(null)
  const registerId = useRef(options.registerId)

  // The server is only told about a sale when a screen is paired to hear it.
  const pairing = useQuery({ ...displayPairingQuery(options.registerId), refetchInterval: PAIRING_REFRESH_MS })
  const displays = pairing.data?.displays ?? 0
  const paired = useRef(displays)

  // The sender reads these when it sends, so keep them current without touching refs while rendering.
  useEffect(() => {
    registerId.current = options.registerId
    paired.current = displays
  }, [options.registerId, displays])

  useEffect(() => {
    const server = createServerSender({
      send: (envelope) => publishDisplayState(registerId.current, envelope),
      isEnabled: () => paired.current > 0,
    })
    const channels: DisplayChannel[] = isChannelSupported() ? [openBroadcastChannel(), server] : [server]
    const channel = combineChannels(...channels)
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

  // A screen was just paired: it has heard nothing yet, so give it the current basket now, not at the heartbeat.
  useEffect(() => {
    if (displays > 0) publisher.current?.resend()
  }, [displays])

  // The view is rebuilt on every render; only a change of its content is worth a message.
  const serialized = JSON.stringify(view)
  useEffect(() => {
    publisher.current?.update(JSON.parse(serialized) as DisplayView)
  }, [serialized])
}
