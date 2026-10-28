import { describe, expect, test } from 'bun:test'
import { mockCheckoutPolicy, mockMediaStorage } from '../../../__tests__/mocks'
import { GetCapabilitiesUseCase } from './get-capabilities.usecase'

const setup = (shifts: boolean, images: boolean) => {
  const policy = mockCheckoutPolicy()
  policy.isShiftsEnabled.mockResolvedValue(shifts)
  const media = mockMediaStorage()
  media.isEnabled.mockReturnValue(images)
  return new GetCapabilitiesUseCase(policy, media)
}

describe('GetCapabilitiesUseCase', () => {
  test('reports shift checkout and image storage when both are on', async () => {
    expect(await setup(true, true).execute()).toEqual({ checkoutMode: 'shifts', imageStorage: 'enabled' })
  })

  test('reports legacy checkout and no image storage when both are off', async () => {
    expect(await setup(false, false).execute()).toEqual({ checkoutMode: 'legacy', imageStorage: 'disabled' })
  })
})
