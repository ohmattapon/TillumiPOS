import { useEffect, useState } from 'react'
import { DISPLAY_STREAM_URL, startDisplaySession } from '../api'
import { isChannelSupported, openBroadcastChannel } from '../lib/channel'
import type { DisplayEnvelope } from '../lib/display-state'
import { DisplayReceiver } from '../lib/receiver'
import { DisplaySessionClient, openEventSourceStream, type DisplayConnection } from '../lib/session-client'

const TOKEN_KEY = 'pos.customerDisplayToken'
const STREAM_EVENTS = ['waiting', 'paired', 'state', 'unpaired', 'expired', 'ping'] as const

// Storage can be blocked (private windows, kiosks): the screen still works, it just asks for a code again after a reload.
const storage = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      // Not remembering the token only costs a new code after a reload.
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      // Same as above.
    }
  },
}

export interface DisplayFeed {
  /** What the till last sent (or an idle screen once it has gone quiet); null until it has spoken. */
  view: DisplayEnvelope | null
  /** Where this screen stands with the server: the code to show while it is waiting for a till. */
  connection: DisplayConnection
}

/**
 * Both ways a till can reach this screen end in one receiver, which believes the newest message: the browser
 * channel (a till in the same browser) and the server stream (a till that entered this screen's code).
 */
export function useDisplayReceiver(): DisplayFeed {
  const [view, setView] = useState<DisplayEnvelope | null>(null)
  const [connection, setConnection] = useState<DisplayConnection>({ phase: 'connecting' })

  useEffect(() => {
    const receiver = new DisplayReceiver()
    const refresh = () => setView(receiver.view())
    const take = (raw: unknown) => {
      if (receiver.receive(raw)) refresh()
    }

    const channel = isChannelSupported() ? openBroadcastChannel() : null
    const stop = channel?.subscribe(take)
    // Ask for the current state: this window may have opened after the till last spoke.
    channel?.post({ type: 'hello' })

    const session = new DisplaySessionClient({
      start: startDisplaySession,
      open: openEventSourceStream(DISPLAY_STREAM_URL, STREAM_EVENTS),
      storage,
      onMessage: take,
      onStatus: setConnection,
    })
    session.start()

    // The screen can go idle through silence alone, with no message to trigger a render.
    const timer = setInterval(refresh, 1_000)
    return () => {
      clearInterval(timer)
      session.stop()
      stop?.()
      channel?.close()
    }
  }, [])

  return { view, connection }
}
