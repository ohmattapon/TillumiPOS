import { beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, signIn } from '../../../test/harness'

beforeEach(resetDatabase)

describe('capabilities', () => {
  test('reports the checkout mode and whether product images are set up', async () => {
    const owner = await signIn('owner')

    const capabilities = ok(await owner.apiV2.capabilities.get())

    // The test setup runs an in-memory image store, so images are set up.
    expect(capabilities).toEqual({ checkoutMode: expect.stringMatching(/legacy|shifts/), imageStorage: 'enabled' })
  })
})
