import type { DisplayChannel } from './channel'
import type { DisplayEnvelope } from './display-state'

/** Sends every message to all the channels, and tells the listener what any of them hears. */
export function combineChannels(...channels: DisplayChannel[]): DisplayChannel {
  return {
    post: (message) => channels.forEach((channel) => channel.post(message)),
    subscribe(listener) {
      const stops = channels.map((channel) => channel.subscribe(listener))
      return () => stops.forEach((stop) => stop())
    },
    close: () => channels.forEach((channel) => channel.close()),
  }
}

export interface ServerSenderOptions {
  /** Puts one envelope on the server. A failure is reported by rejecting. */
  send: (envelope: DisplayEnvelope) => Promise<unknown>
  /** Whether the server is worth telling now (for instance, a screen is paired). Asked at every send. */
  isEnabled?: () => boolean
  onError?: (error: unknown) => void
}

/**
 * The till's side of the server: a channel that only sends. It keeps one request in flight and, while it is,
 * only the newest envelope waits behind it, so a slow network can never make the screen replay old baskets.
 * What the screens ask the till (`hello`) is not for the server: it keeps the last state itself.
 */
export function createServerSender({ send, isEnabled = () => true, onError }: ServerSenderOptions): DisplayChannel {
  let inFlight = false
  let waiting: DisplayEnvelope | null = null

  const run = async (envelope: DisplayEnvelope) => {
    inFlight = true
    try {
      await send(envelope)
    } catch (error) {
      onError?.(error)
    } finally {
      inFlight = false
    }
    if (waiting !== null) {
      const next = waiting
      waiting = null
      void run(next)
    }
  }

  return {
    post(message) {
      if (message.type !== 'state' || !isEnabled()) return
      const envelope = message.envelope as DisplayEnvelope
      if (inFlight) waiting = envelope
      else void run(envelope)
    },
    subscribe: () => () => {},
    close() {
      waiting = null
    },
  }
}
