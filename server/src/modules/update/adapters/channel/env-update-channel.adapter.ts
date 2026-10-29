import { injectable } from 'tsyringe'
import type { IUpdateChannel } from '../../applications/ports/update-channel.port'

/**
 * NATIVE_UPDATES=1 is set by the native Windows service (installer/winsw/tillumi-pos.xml).
 * Read at call time, like the other configuration adapters, so nothing is cached at startup.
 */
@injectable()
export class EnvUpdateChannel implements IUpdateChannel {
  constructor(private readonly read: () => string | undefined = () => Bun.env.NATIVE_UPDATES) {}

  isEnabled(): boolean {
    return this.read() === '1'
  }
}
