import { useEffect, useState } from 'react'
import { isChannelSupported, openBroadcastChannel } from '../lib/channel'
import type { DisplayEnvelope } from '../lib/display-state'
import { DisplayReceiver } from '../lib/receiver'

/** What the till last sent (or an idle screen once it has gone quiet); null until it has spoken. */
export function useDisplayReceiver(): DisplayEnvelope | null {
  const [view, setView] = useState<DisplayEnvelope | null>(null)

  useEffect(() => {
    if (!isChannelSupported()) return
    const receiver = new DisplayReceiver()
    const channel = openBroadcastChannel()
    const refresh = () => setView(receiver.view())
    const stop = channel.subscribe((raw) => {
      if (receiver.receive(raw)) refresh()
    })
    // The screen can go idle through silence alone, with no message to trigger a render.
    const timer = setInterval(refresh, 1_000)
    // Ask for the current state: this window may have opened after the till last spoke.
    channel.post({ type: 'hello' })
    return () => {
      clearInterval(timer)
      stop()
      channel.close()
    }
  }, [])

  return view
}
