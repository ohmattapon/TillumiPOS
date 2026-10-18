import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeSlide } from '../../../../__tests__/factories'
import {
  mockAuditLog,
  mockMediaStorage,
  mockSlideRepository,
  mockUnitOfWork,
} from '../../../../__tests__/mocks'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { DeleteSlideUseCase } from './delete-slide.usecase'
import { ListActiveSlidesUseCase } from './list-active-slides.usecase'
import { ListSlidesUseCase } from './list-slides.usecase'
import { UpdateSlideUseCase } from './update-slide.usecase'
import { UploadSlideImageUseCase } from './upload-slide-image.usecase'
import type { ISlideIdGenerator } from '../ports/slide-id-generator.port'

let repo: ReturnType<typeof mockSlideRepository>
let media: ReturnType<typeof mockMediaStorage>

beforeEach(() => {
  repo = mockSlideRepository()
  media = mockMediaStorage()
})

const owner = { role: 'owner' as const, id: 1, displayName: 'เจ้าของ' }
const cashier = { role: 'cashier' as const, id: 2, displayName: 'แคชเชียร์' }
const png = (size = 10) => new Blob(['x'.repeat(size)], { type: 'image/png' })
const notFound = { code: 'NOT_FOUND', message: 'ไม่พบสไลด์' }

/** Fixed UUID so tests prove the minted id flows verbatim into the storage key. */
const slideUuid = '550e8400-e29b-41d4-a716-446655440000'
const mockSlideIds = (id = slideUuid): ISlideIdGenerator => ({ newId: mock(() => id) })

describe('ListActiveSlidesUseCase', () => {
  test('returns only the visible slides, in order', async () => {
    const active = [makeSlide({ id: 1 }), makeSlide({ id: 2 })]
    repo.findActive.mockResolvedValue(active)

    expect(await new ListActiveSlidesUseCase(repo).execute()).toBe(active)
  })
})

describe('ListSlidesUseCase', () => {
  test('an owner lists every slide, active or not', async () => {
    const all = [makeSlide({ id: 1 }), makeSlide({ id: 2, isActive: false })]
    repo.findAll.mockResolvedValue(all)

    expect(await new ListSlidesUseCase(repo).execute(owner)).toBe(all)
  })

  test('a cashier without the promotions permission is refused', async () => {
    const attempt = new ListSlidesUseCase(repo).execute(cashier)

    await expect(attempt).rejects.toBeInstanceOf(DomainForbiddenError)
    await expect(attempt).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      params: { permission: 'promotions.write' },
    })
    expect(repo.findAll).not.toHaveBeenCalled()
  })
})

describe('UploadSlideImageUseCase', () => {
  test('stores the file under a fresh slides key and appends the slide at the end', async () => {
    repo.findAll.mockResolvedValue([makeSlide({ id: 1, sortOrder: 0 }), makeSlide({ id: 2, sortOrder: 4 })])
    repo.create.mockImplementation(async (entity) => makeSlide({ ...entity.toSnapshot(), id: 9 }))
    const audit = mockAuditLog()
    const ids = mockSlideIds()
    const useCase = new UploadSlideImageUseCase(repo, media, mockUnitOfWork(), audit, ids)

    const created = await useCase.execute({ file: png() }, owner)

    const [key, uploaded] = media.put.mock.calls[0]!
    expect(ids.newId).toHaveBeenCalledTimes(1)
    expect(key).toBe(`slides/${slideUuid}.png`)
    expect(uploaded).toBeInstanceOf(Blob)
    expect(created.toSnapshot()).toMatchObject({ id: 9, imageKey: key, sortOrder: 5, isActive: true })
    expect(audit.record).toHaveBeenCalled()
  })

  test('an explicit order and visibility are kept', async () => {
    repo.findAll.mockResolvedValue([])
    repo.create.mockImplementation(async (entity) => makeSlide({ ...entity.toSnapshot(), id: 9 }))
    const useCase = new UploadSlideImageUseCase(repo, media, mockUnitOfWork(), mockAuditLog(), mockSlideIds())

    const created = await useCase.execute({ file: png(), sortOrder: 2, isActive: false }, owner)

    expect(created.toSnapshot()).toMatchObject({ sortOrder: 2, isActive: false })
  })

  test('a cashier cannot upload', async () => {
    const useCase = new UploadSlideImageUseCase(repo, media, mockUnitOfWork(), mockAuditLog(), mockSlideIds())

    await expect(useCase.execute({ file: png() }, cashier)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      params: { permission: 'promotions.write' },
    })
    expect(media.put).not.toHaveBeenCalled()
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('a non-image file is rejected before anything is stored', async () => {
    const useCase = new UploadSlideImageUseCase(repo, media, mockUnitOfWork(), mockAuditLog(), mockSlideIds())
    const file = new Blob(['%PDF'], { type: 'application/pdf' })

    await expect(useCase.execute({ file }, owner)).rejects.toMatchObject({
      code: 'INVALID_FILE_TYPE',
    })
    expect(media.put).not.toHaveBeenCalled()
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('a file over 5 MB is rejected before anything is stored', async () => {
    const useCase = new UploadSlideImageUseCase(repo, media, mockUnitOfWork(), mockAuditLog(), mockSlideIds())

    await expect(useCase.execute({ file: png(5 * 1024 * 1024 + 1) }, owner)).rejects.toMatchObject({
      code: 'IMAGE_TOO_LARGE',
    })
    expect(media.put).not.toHaveBeenCalled()
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('a shop without image storage gets a clear error and stores nothing', async () => {
    media.isEnabled.mockReturnValue(false)
    const useCase = new UploadSlideImageUseCase(repo, media, mockUnitOfWork(), mockAuditLog(), mockSlideIds())

    const attempt = useCase.execute({ file: png() }, owner)

    await expect(attempt).rejects.toBeInstanceOf(DomainExternalServiceError)
    await expect(attempt).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
    expect(media.put).not.toHaveBeenCalled()
    expect(repo.create).not.toHaveBeenCalled()
  })

  test.each([[{}], [{ file: 'not-a-blob' }], [{ file: png(), sortOrder: -1 }]])(
    'rejects the invalid input %p without storing anything',
    async (input) => {
      const useCase = new UploadSlideImageUseCase(repo, media, mockUnitOfWork(), mockAuditLog(), mockSlideIds())

      await expect(useCase.execute(input, owner)).rejects.toBeInstanceOf(ZodError)
      expect(media.put).not.toHaveBeenCalled()
      expect(repo.create).not.toHaveBeenCalled()
    },
  )
})

describe('UpdateSlideUseCase', () => {
  test('changes only the given fields', async () => {
    repo.findById.mockResolvedValue(makeSlide({ id: 4, sortOrder: 1, isActive: true }))
    repo.update.mockImplementation(async (entity) => entity)
    const audit = mockAuditLog()
    const useCase = new UpdateSlideUseCase(repo, mockUnitOfWork(), audit)

    const updated = await useCase.execute(4, { sortOrder: 7 }, owner)

    expect(updated.toSnapshot()).toMatchObject({ id: 4, sortOrder: 7, isActive: true })
    expect(audit.record).toHaveBeenCalled()
  })

  test('flips visibility without touching the order', async () => {
    repo.findById.mockResolvedValue(makeSlide({ id: 4, sortOrder: 1, isActive: true }))
    repo.update.mockImplementation(async (entity) => entity)
    const useCase = new UpdateSlideUseCase(repo, mockUnitOfWork(), mockAuditLog())

    const updated = await useCase.execute(4, { isActive: false }, owner)

    expect(updated.toSnapshot()).toMatchObject({ sortOrder: 1, isActive: false })
  })

  test('a cashier cannot edit, and an unknown slide is not found', async () => {
    repo.findById.mockResolvedValue(makeSlide({ id: 1 }))
    const useCase = new UpdateSlideUseCase(repo, mockUnitOfWork(), mockAuditLog())

    await expect(useCase.execute(1, { isActive: false }, cashier)).rejects.toBeInstanceOf(DomainForbiddenError)
    expect(repo.update).not.toHaveBeenCalled()

    repo.findById.mockResolvedValue(null)
    const missing = useCase.execute(9999, { isActive: false }, owner)
    await expect(missing).rejects.toBeInstanceOf(DomainNotFoundError)
    await expect(missing).rejects.toMatchObject(notFound)
    expect(repo.update).not.toHaveBeenCalled()
  })

  test('rejects an invalid change before reading or writing', async () => {
    const useCase = new UpdateSlideUseCase(repo, mockUnitOfWork(), mockAuditLog())

    await expect(useCase.execute(1, { sortOrder: -1 }, owner)).rejects.toBeInstanceOf(ZodError)
    expect(repo.findById).not.toHaveBeenCalled()
  })
})

describe('DeleteSlideUseCase', () => {
  test('removes the slide, deletes its file best-effort, and audits', async () => {
    const stored = makeSlide({ id: 4, imageKey: 'slides/550e8400-e29b-41d4-a716-446655440000.png' })
    repo.delete.mockResolvedValue(stored)
    const audit = mockAuditLog()
    const useCase = new DeleteSlideUseCase(repo, media, mockUnitOfWork(), audit)

    const removed = await useCase.execute(4, owner)

    expect(removed).toBe(stored)
    expect(media.delete).toHaveBeenCalledWith(stored.imageKey)
    expect(audit.record).toHaveBeenCalled()
  })

  test('a failing file cleanup does not fail the request', async () => {
    repo.delete.mockResolvedValue(makeSlide({ id: 4 }))
    media.delete.mockRejectedValue(new DomainError('storage down', 'MEDIA_UNAVAILABLE'))
    const useCase = new DeleteSlideUseCase(repo, media, mockUnitOfWork(), mockAuditLog())

    await expect(useCase.execute(4, owner)).resolves.toBeDefined()
  })

  test('a cashier cannot delete, and an unknown slide is not found', async () => {
    const useCase = new DeleteSlideUseCase(repo, media, mockUnitOfWork(), mockAuditLog())

    await expect(useCase.execute(1, cashier)).rejects.toBeInstanceOf(DomainForbiddenError)
    expect(repo.delete).not.toHaveBeenCalled()
    expect(media.delete).not.toHaveBeenCalled()

    repo.delete.mockRejectedValue(new DomainNotFoundError('ไม่พบสไลด์'))
    await expect(useCase.execute(9999, owner)).rejects.toMatchObject(notFound)
    expect(media.delete).not.toHaveBeenCalled()
  })
})
