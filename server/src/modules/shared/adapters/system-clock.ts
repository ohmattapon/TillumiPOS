import { injectable } from 'tsyringe'
import type { IClock } from '../ports/clock.port'

@injectable()
export class SystemClock implements IClock {
  now() {
    return new Date()
  }
}
