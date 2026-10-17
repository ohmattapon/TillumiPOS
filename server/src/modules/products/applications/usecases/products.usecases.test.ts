import { mockAuditLog as auditMock, mockUnitOfWork as auditUnitOfWork } from '../../../../__tests__/mocks'
import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeProduct } from '../../../../__tests__/factories'
import { mockMediaStorage, mockProductRepository } from '../../../../__tests__/mocks'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { CreateProductUseCase } from './create-product.usecase'
import { GetProductUseCase } from './get-product.usecase'
import { ListProductsUseCase } from './list-products.usecase'
import { RemoveProductImageUseCase } from './remove-product-image.usecase'
import { SetProductImageUseCase } from './set-product-image.usecase'
import { UpdateProductUseCase } from './update-product.usecase'

let repo: ReturnType<typeof mockProductRepository>
let media: ReturnType<typeof mockMediaStorage>

beforeEach(() => {
  repo = mockProductRepository()
  media = mockMediaStorage()
})

const notFound = { code: 'NOT_FOUND', message: 'ไม่พบสินค้า' }
const png = () => new Blob(['image bytes'], { type: 'image/png' })

describe('ListProductsUseCase', () => {
  test('passes the validated query to the repository', async () => {
    const stored = { items: [makeProduct()], total: 1 }
    repo.findAll.mockResolvedValue(stored)

    const result = await new ListProductsUseCase(repo).execute({ q: 'น้ำ', limit: 10, unknown: true }, 1)

    expect(result).toBe(stored)
    expect(repo.findAll).toHaveBeenCalledWith({ q: 'น้ำ', limit: 10, branchId: 1 })
  })

  test('an omitted query lists with defaults', async () => {
    repo.findAll.mockResolvedValue({ items: [], total: 0 })

    await new ListProductsUseCase(repo).execute({}, 1)

    expect(repo.findAll).toHaveBeenCalledWith({ branchId: 1 })
  })

  test.each([[{ limit: 0 }], [{ limit: 1001 }], [{ offset: -1 }], [{ categoryId: 1.5 }]])(
    'rejects the query %p',
    async (query) => {
      await expect(new ListProductsUseCase(repo).execute(query, 1)).rejects.toBeInstanceOf(ZodError)
      expect(repo.findAll).not.toHaveBeenCalled()
    },
  )
})

describe('GetProductUseCase', () => {
  test('returns the product', async () => {
    const stored = makeProduct({ id: 7 })
    repo.findById.mockResolvedValue(stored)

    expect(await new GetProductUseCase(repo).execute(7, 1)).toBe(stored)
  })

  test('an unknown id is not found', async () => {
    repo.findById.mockResolvedValue(null)

    const attempt = new GetProductUseCase(repo).execute(9999, 1)

    await expect(attempt).rejects.toBeInstanceOf(DomainNotFoundError)
    await expect(attempt).rejects.toMatchObject(notFound)
  })
})

describe('CreateProductUseCase', () => {
  let useCase: CreateProductUseCase

  beforeEach(() => {
    repo.create.mockImplementation(async (entity) => makeProduct({ ...entity.toSnapshot(), id: 9 }))
    useCase = new CreateProductUseCase(repo, auditUnitOfWork(), auditMock())
  })

  test('fills the defaults: no barcode or category, zero cost, tracked, empty, active, no image', async () => {
    const created = await useCase.execute({ sku: 'NEW-1', name: 'ใหม่', priceSatang: 100 }, 1, { id: 1, displayName: 'ผู้ทดสอบ' })

    expect(created.toSnapshot()).toEqual({
      id: 9,
      sku: 'NEW-1',
      barcode: null,
      name: 'ใหม่',
      categoryId: null,
      priceSatang: 100,
      costSatang: 0,
      trackStock: true,
      stockQty: 0,
      isActive: true,
      imageKey: null,
      packs: [],
    })
  })

  test('keeps the optional fields that are given', async () => {
    const created = await useCase.execute({
      sku: 'NEW-1',
      name: 'ใหม่',
      priceSatang: 100,
      barcode: '885',
      categoryId: 3,
      costSatang: 60,
      trackStock: false,
    }, 1, { id: 1, displayName: 'ผู้ทดสอบ' })

    expect(created.toSnapshot()).toMatchObject({ barcode: '885', categoryId: 3, costSatang: 60, trackStock: false })
  })

  test('opening stock, image and active flag cannot be set by the caller', async () => {
    await useCase.execute({ sku: 'NEW-1', name: 'ใหม่', priceSatang: 100, stockQty: 50, imageKey: 'x', isActive: false }, 1, { id: 1, displayName: 'ผู้ทดสอบ' })

    expect(repo.create.mock.calls[0]![0].toSnapshot()).toMatchObject({ stockQty: 0, imageKey: null, isActive: true })
  })

  test.each([
    ['a missing price', { sku: 'A', name: 'a' }],
    ['a negative price', { sku: 'A', name: 'a', priceSatang: -1 }],
    ['a fractional price', { sku: 'A', name: 'a', priceSatang: 9.99 }],
    ['an empty SKU', { sku: '', name: 'a', priceSatang: 1 }],
    ['an empty name', { sku: 'A', name: '', priceSatang: 1 }],
    ['an empty barcode', { sku: 'A', name: 'a', priceSatang: 1, barcode: '' }],
  ])('rejects %s without storing anything', async (_label, input) => {
    await expect(useCase.execute(input, 1, { id: 1, displayName: 'ผู้ทดสอบ' })).rejects.toBeInstanceOf(ZodError)
    expect(repo.create).not.toHaveBeenCalled()
  })
})

describe('UpdateProductUseCase', () => {
  let useCase: UpdateProductUseCase

  beforeEach(() => {
    repo.findById.mockResolvedValue(makeProduct({ id: 4, barcode: '885', categoryId: 2, stockQty: 5 }))
    repo.update.mockImplementation(async (entity) => entity)
    useCase = new UpdateProductUseCase(repo, auditUnitOfWork(), auditMock())
  })

  test('changes only the given fields', async () => {
    const updated = await useCase.execute(4, { name: 'น้ำแร่', priceSatang: 1500 }, 1, { id: 1, displayName: 'ผู้ทดสอบ' })

    expect(updated.toSnapshot()).toMatchObject({ id: 4, name: 'น้ำแร่', priceSatang: 1500, barcode: '885', stockQty: 5 })
  })

  test('null clears the barcode and category', async () => {
    const updated = await useCase.execute(4, { barcode: null, categoryId: null }, 1, { id: 1, displayName: 'ผู้ทดสอบ' })

    expect(updated.toSnapshot()).toMatchObject({ barcode: null, categoryId: null })
  })

  test('stock cannot be changed here: the field is dropped', async () => {
    const updated = await useCase.execute(4, { name: 'น้ำแร่', stockQty: 999 }, 1, { id: 1, displayName: 'ผู้ทดสอบ' })

    expect(updated.stockQty).toBe(5)
  })

  test('an empty change set stores the product unchanged', async () => {
    const updated = await useCase.execute(4, {}, 1, { id: 1, displayName: 'ผู้ทดสอบ' })

    expect(updated.toSnapshot()).toEqual(makeProduct({ id: 4, barcode: '885', categoryId: 2, stockQty: 5 }).toSnapshot())
  })

  test('an unknown id is not found, and nothing is written', async () => {
    repo.findById.mockResolvedValue(null)

    await expect(useCase.execute(9999, { name: 'ผี' }, 1, { id: 1, displayName: 'ผู้ทดสอบ' })).rejects.toMatchObject(notFound)
    expect(repo.update).not.toHaveBeenCalled()
  })

  test('rejects an invalid change before reading or writing', async () => {
    await expect(useCase.execute(4, { priceSatang: -1 }, 1, { id: 1, displayName: 'ผู้ทดสอบ' })).rejects.toBeInstanceOf(ZodError)
    expect(repo.findById).not.toHaveBeenCalled()
  })
})

describe('SetProductImageUseCase', () => {
  let useCase: SetProductImageUseCase

  beforeEach(() => {
    repo.findById.mockResolvedValue(makeProduct({ id: 4, imageKey: 'products/4/old.png' }))
    repo.setImageKey.mockImplementation(async (id, imageKey) => makeProduct({ id, imageKey }))
    useCase = new SetProductImageUseCase(repo, media)
  })

  test('uploads under a fresh key, records it, then deletes the image it replaced', async () => {
    const file = png()

    const updated = await useCase.execute(4, file, 1)

    const [key, uploaded] = media.put.mock.calls[0]!
    expect(key).toMatch(/^products\/4\/[0-9a-f-]{36}\.png$/)
    expect(uploaded).toBe(file)
    expect(repo.setImageKey).toHaveBeenCalledWith(4, key, 1)
    expect(updated.imageKey).toBe(key)
    expect(media.delete).toHaveBeenCalledWith('products/4/old.png')
  })

  test.each([
    ['image/jpeg', 'jpg'],
    ['image/webp', 'webp'],
  ])('a %s file gets the %s extension', async (type, extension) => {
    await useCase.execute(4, new Blob(['x'], { type }), 1)

    expect(media.put.mock.calls[0]![0]).toEndWith(`.${extension}`)
  })

  test('two uploads never share a key', async () => {
    await useCase.execute(4, png(), 1)
    await useCase.execute(4, png(), 1)

    expect(media.put.mock.calls[0]![0]).not.toBe(media.put.mock.calls[1]![0])
  })

  test('a first image deletes nothing', async () => {
    repo.findById.mockResolvedValue(makeProduct({ id: 4, imageKey: null }))

    await useCase.execute(4, png(), 1)

    expect(media.delete).not.toHaveBeenCalled()
  })

  test('an unknown product is not found and nothing is uploaded', async () => {
    repo.findById.mockResolvedValue(null)

    await expect(useCase.execute(9999, png(), 1)).rejects.toMatchObject(notFound)
    expect(media.put).not.toHaveBeenCalled()
  })

  test('when the upload fails the product keeps its current image', async () => {
    const failure = new DomainExternalServiceError('เชื่อมต่อที่เก็บรูปภาพไม่ได้ ลองใหม่อีกครั้ง', 'MEDIA_UNAVAILABLE')
    media.put.mockRejectedValue(failure)

    await expect(useCase.execute(4, png(), 1)).rejects.toBe(failure)
    expect(repo.setImageKey).not.toHaveBeenCalled()
    expect(media.delete).not.toHaveBeenCalled()
  })

  test('a failed cleanup of the old image does not fail the request', async () => {
    media.delete.mockRejectedValue(new Error('storage hiccup'))

    const updated = await useCase.execute(4, png(), 1)

    expect(updated.imageKey).toMatch(/^products\/4\//)
  })

  test('a file that is not an accepted image type is refused before anything else', async () => {
    const attempt = useCase.execute(4, new Blob(['%PDF'], { type: 'application/pdf' }), 1)

    await expect(attempt).rejects.toBeInstanceOf(DomainError)
    await expect(attempt).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' })
    expect(repo.findById).not.toHaveBeenCalled()
  })
})

describe('RemoveProductImageUseCase', () => {
  let useCase: RemoveProductImageUseCase

  beforeEach(() => {
    repo.findById.mockResolvedValue(makeProduct({ id: 4, imageKey: 'products/4/old.png' }))
    repo.setImageKey.mockImplementation(async (id, imageKey) => makeProduct({ id, imageKey }))
    useCase = new RemoveProductImageUseCase(repo, media)
  })

  test('clears the key and deletes the stored image', async () => {
    const updated = await useCase.execute(4, 1)

    expect(updated.imageKey).toBeNull()
    expect(repo.setImageKey).toHaveBeenCalledWith(4, null, 1)
    expect(media.delete).toHaveBeenCalledWith('products/4/old.png')
  })

  test('a product without an image deletes nothing', async () => {
    repo.findById.mockResolvedValue(makeProduct({ id: 4, imageKey: null }))

    await useCase.execute(4, 1)

    expect(media.delete).not.toHaveBeenCalled()
  })

  test('an unknown product is not found', async () => {
    repo.findById.mockResolvedValue(null)

    await expect(useCase.execute(9999, 1)).rejects.toMatchObject(notFound)
  })

  test('a failed deletion does not fail the request', async () => {
    media.delete.mockRejectedValue(new Error('storage hiccup'))

    expect((await useCase.execute(4, 1)).imageKey).toBeNull()
  })
})
