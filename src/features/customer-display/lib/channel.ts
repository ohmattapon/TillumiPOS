import { CHANNEL_NAME, type DisplayMessage } from './display-state'

/** The wire between the till and the customer's screen. An interface so tests can use the in-memory bus. */
export interface DisplayChannel {
  post(message: DisplayMessage): void
  /** Calls `listener` with every message another endpoint sends; returns the function that stops it. */
  subscribe(listener: (message: unknown) => void): () => void
  close(): void
}

export const isChannelSupported = () => typeof BroadcastChannel !== 'undefined'

/** Same origin, same browser profile: nothing leaves the computer and no server is involved. */
export function openBroadcastChannel(): DisplayChannel {
  const channel = new BroadcastChannel(CHANNEL_NAME)
  return {
    post: (message) => channel.postMessage(message),
    subscribe(listener) {
      const handler = (event: MessageEvent) => listener(event.data)
      channel.addEventListener('message', handler)
      return () => channel.removeEventListener('message', handler)
    },
    close: () => channel.close(),
  }
}

/**
 * An in-memory stand-in for the browser channel, for tests: what one endpoint posts, every other endpoint
 * on the bus receives, as a copy, and never the sender itself, like a real BroadcastChannel.
 */
export function createMemoryBus() {
  type Listener = (message: unknown) => void
  const endpoints = new Set<{ listeners: Set<Listener> }>()
  return {
    open(): DisplayChannel {
      const self = { listeners: new Set<Listener>() }
      endpoints.add(self)
      return {
        post(message) {
          const copy = structuredClone(message)
          for (const endpoint of endpoints) {
            if (endpoint === self) continue
            for (const listener of endpoint.listeners) listener(copy)
          }
        },
        subscribe(listener) {
          self.listeners.add(listener)
          return () => void self.listeners.delete(listener)
        },
        close() {
          self.listeners.clear()
          endpoints.delete(self)
        },
      }
    },
  }
}
