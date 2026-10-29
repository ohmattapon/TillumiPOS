// Child processes of one load run, so that a crash or Ctrl+C leaves nothing running behind.
import type { Subprocess } from 'bun'

type SpawnOptions = Parameters<typeof Bun.spawn>[1]

const KILL_AFTER_MS = 3000

function terminate(child: Subprocess, signal: 'SIGTERM' | 'SIGKILL') {
  // On Windows the wrapper has children of its own (the real server); take the whole tree down, as e2e/run.ts does.
  if (process.platform === 'win32') Bun.spawnSync(['taskkill', '/F', '/T', '/PID', String(child.pid)], { stdout: 'ignore', stderr: 'ignore' })
  else child.kill(signal)
}

export function createProcessGroup() {
  const children = new Set<Subprocess>()

  async function stopOne(child: Subprocess) {
    if (child.exitCode !== null || child.signalCode !== null) return
    terminate(child, 'SIGTERM')
    const timer = setTimeout(() => terminate(child, 'SIGKILL'), KILL_AFTER_MS)
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
    /** Safe to call repeatedly, and from signal and exit handlers. */
    async stopAll(): Promise<void> {
      const running = [...children]
      children.clear()
      await Promise.all(running.map(stopOne))
    },
  }
}
