// Child processes of one load run, so that a crash or Ctrl+C leaves nothing running behind.
import type { Subprocess } from 'bun'

type SpawnOptions = Parameters<typeof Bun.spawn>[1]

const DEFAULT_GRACE_MS = 3000

function terminate(child: Subprocess, signal: 'SIGTERM' | 'SIGKILL') {
  // On Windows the wrapper has children of its own (the real server); take the whole tree down, as e2e/run.ts does.
  // There is no gentle signal there, so the tree dies at once.
  if (process.platform === 'win32') Bun.spawnSync(['taskkill', '/F', '/T', '/PID', String(child.pid)], { stdout: 'ignore', stderr: 'ignore' })
  else child.kill(signal)
}

export function createProcessGroup(options: { graceMs?: number } = {}) {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS
  const children = new Set<Subprocess>()
  let stopping: Promise<void> | null = null

  async function stopOne(child: Subprocess) {
    if (child.exitCode !== null || child.signalCode !== null) return
    terminate(child, 'SIGTERM')
    const timer = setTimeout(() => terminate(child, 'SIGKILL'), graceMs)
    try {
      await child.exited
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    spawn(cmd: string[], opts: SpawnOptions = {}): Subprocess {
      const child = Bun.spawn(cmd, opts)
      children.add(child)
      return child
    },
    /**
     * Safe to call repeatedly and from signal and exit handlers. A call made while another is still stopping waits
     * for that same stop, so every caller returns only when the children are really gone.
     */
    stopAll(): Promise<void> {
      if (stopping) return stopping
      const running = [...children]
      children.clear()
      // The kills are sent synchronously here, which is all an 'exit' handler can do.
      stopping = Promise.all(running.map(stopOne)).then(() => undefined).finally(() => {
        stopping = null
      })
      return stopping
    },
  }
}
