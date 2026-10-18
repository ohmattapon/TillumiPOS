import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { container } from 'tsyringe'
import { announceSetupCode } from '../../modules/setup/announce-setup-code'
import { setupCodeToken, type ISetupCode } from '../../modules/setup/applications/ports/setup-code.port'
import { resetDatabase, signIn } from '../../../test/harness'

let log: ReturnType<typeof spyOn<Console, 'log'>>

beforeEach(async () => {
  await resetDatabase()
  log = spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => log.mockRestore())

describe('announceSetupCode', () => {
  test('a shop with nobody in it prints a code that the setup then accepts', async () => {
    await announceSetupCode()

    const printed = log.mock.calls.map((call) => String(call[0])).join('\n')
    const code = printed.match(/SETUP CODE[^:]*:\s+(\S+)/)?.[1]
    expect(code).toBeString()
    expect(container.resolve<ISetupCode>(setupCodeToken).verify(code!)).toBe('accepted')
  })

  test('a shop that already has users prints nothing', async () => {
    await signIn('owner')

    await announceSetupCode()

    expect(log).not.toHaveBeenCalled()
  })
})
