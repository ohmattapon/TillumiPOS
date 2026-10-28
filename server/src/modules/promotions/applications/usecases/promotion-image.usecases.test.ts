import 'reflect-metadata'
import { beforeEach, describe, expect, test } from 'bun:test'
import { mockMediaStorage, mockPromotionRepository } from '../../../../__tests__/mocks'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import { PromotionEntity } from '../../../../domains/promotion.domain'
import { RemovePromotionImageUseCase } from './remove-promotion-image.usecase'
import { SetPromotionImageUseCase } from './set-promotion-image.usecase'

let repo: ReturnType<typeof mockPromotionRepository>
let media: ReturnType<typeof mockMediaStorage>

beforeEach(() => {
  repo = mockPromotionRepository()
  media = mockMediaStorage()
})

const now = new Date('2026-10-15T12:00:00Z')
const makePromotion = (overrides: Partial<ConstructorParameters<typeof PromotionEntity>[0]> = {}) =>
  new PromotionEntity({
    id: 4, name: 'ลด 10%', kind: 'percent', value: 1000, maxDiscountSatang: 100, minSubtotalSatang: 0,
    startsOn: null, endsOn: null, weekdays: null, windowStartMinute: null, windowEndMinute: null,
    audience: 'everyone', isActive: true, scope: null, imageKey: 'promotions/4/old.png',
    createdAt: now, updatedAt: now,
    couponCode: null, buyQuantity: null, freeQuantity: null, maxUses: null, maxUsesPerMember: null, ...overrides,
  })
const notFound = { code: 'PROMOTION_NOT_FOUND' }
const png = () => new Blob(['image bytes'], { type: 'image/png' })

describe('SetPromotionImageUseCase', () => {
  let useCase: SetPromotionImageUseCase

  beforeEach(() => {
    repo.findById.mockImplementation(async (id) => (id === 4 ? makePromotion() : null))
    repo.setImageKey.mockImplementation(async (id, imageKey) => makePromotion({ id, imageKey }))
    useCase = new SetPromotionImageUseCase(repo, media)
  })

  test('uploads under a fresh key, records it, then deletes the image it replaced', async () => {
    const file = png()

    const updated = await useCase.execute(4, file)

    const [key, uploaded] = media.put.mock.calls[0]!
    expect(key).toMatch(/^promotions\/4\/[0-9a-f-]{36}\.png$/)
    expect(uploaded).toBe(file)
    expect(repo.setImageKey).toHaveBeenCalledWith(4, key)
    expect(updated.imageKey).toBe(key)
    expect(media.delete).toHaveBeenCalledWith('promotions/4/old.png')
  })

  test.each([
    ['image/jpeg', 'jpg'],
    ['image/webp', 'webp'],
  ])('a %s file gets the %s extension', async (type, extension) => {
    await useCase.execute(4, new Blob(['x'], { type }))

    expect(media.put.mock.calls[0]![0]).toEndWith(`.${extension}`)
  })

  test('two uploads never share a key', async () => {
    await useCase.execute(4, png())
    await useCase.execute(4, png())

    expect(media.put.mock.calls[0]![0]).not.toBe(media.put.mock.calls[1]![0])
  })

  test('a first image deletes nothing', async () => {
    repo.findById.mockResolvedValue(makePromotion({ imageKey: null }))

    await useCase.execute(4, png())

    expect(media.delete).not.toHaveBeenCalled()
  })

  test('an unknown promotion is not found and nothing is uploaded', async () => {
    await expect(useCase.execute(9999, png())).rejects.toMatchObject(notFound)
    expect(media.put).not.toHaveBeenCalled()
  })

  test('when the upload fails the promotion keeps its current image', async () => {
    const failure = new DomainExternalServiceError('เชื่อมต่อที่เก็บรูปภาพไม่ได้ ลองใหม่อีกครั้ง', 'MEDIA_UNAVAILABLE')
    media.put.mockRejectedValue(failure)

    await expect(useCase.execute(4, png())).rejects.toBe(failure)
    expect(repo.setImageKey).not.toHaveBeenCalled()
    expect(media.delete).not.toHaveBeenCalled()
  })

  test('a failed cleanup of the old image does not fail the request', async () => {
    media.delete.mockRejectedValue(new Error('storage hiccup'))

    const updated = await useCase.execute(4, png())

    expect(updated.imageKey).toMatch(/^promotions\/4\//)
  })

  test('a file that is not an accepted image type is refused before anything else', async () => {
    const attempt = useCase.execute(4, new Blob(['%PDF'], { type: 'application/pdf' }))

    await expect(attempt).rejects.toBeInstanceOf(DomainError)
    await expect(attempt).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' })
    expect(repo.findById).not.toHaveBeenCalled()
  })
})

describe('RemovePromotionImageUseCase', () => {
  let useCase: RemovePromotionImageUseCase

  beforeEach(() => {
    repo.findById.mockImplementation(async (id) => (id === 4 ? makePromotion() : null))
    repo.setImageKey.mockImplementation(async (id, imageKey) => makePromotion({ id, imageKey }))
    useCase = new RemovePromotionImageUseCase(repo, media)
  })

  test('clears the key and deletes the stored image', async () => {
    const updated = await useCase.execute(4)

    expect(updated.imageKey).toBeNull()
    expect(repo.setImageKey).toHaveBeenCalledWith(4, null)
    expect(media.delete).toHaveBeenCalledWith('promotions/4/old.png')
  })

  test('a stored image that cannot be deleted does not fail the removal', async () => {
    media.delete.mockRejectedValue(new Error('storage down'))

    const updated = await useCase.execute(4)

    expect(updated.imageKey).toBeNull()
  })

  test('a promotion without an image deletes nothing', async () => {
    repo.findById.mockResolvedValue(makePromotion({ imageKey: null }))

    await useCase.execute(4)

    expect(media.delete).not.toHaveBeenCalled()
  })

  test('an unknown promotion is not found', async () => {
    await expect(useCase.execute(9999)).rejects.toMatchObject(notFound)
    expect(repo.setImageKey).not.toHaveBeenCalled()
  })
})
