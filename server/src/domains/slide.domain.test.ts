import { describe, expect, test } from 'bun:test'
import { SlideEntity } from './slide.domain'
import { DomainError } from './errors/domain-error'

const valid = { id: 1, imageKey: 'slides/11111111-2222-4333-8444-555555555555.png', sortOrder: 0, isActive: true }

describe('SlideEntity', () => {
  test('holds its properties', () => {
    expect(new SlideEntity(valid).toSnapshot()).toEqual(valid)
  })

  test.each(['', 'products/1/11111111-2222-4333-8444-555555555555.png', 'slides/evil/../x.png', 'slides/no-extension', 'slides/x.gif'])(
    'rejects an image key outside slides/ (%p)',
    (imageKey) => {
      expect(() => new SlideEntity({ ...valid, imageKey })).toThrow(DomainError)
    },
  )

  test.each(['', 'products/1/11111111-2222-4333-8444-555555555555.png'])(
    'rejects with the stable INVALID_SLIDE code (%p)',
    (imageKey) => {
      try {
        new SlideEntity({ ...valid, imageKey })
        expect.unreachable('must throw')
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError)
        expect((error as DomainError).code).toBe('INVALID_SLIDE')
      }
    },
  )

  test.each([-1, 1.5, Number.NaN])('rejects a negative or non-integer sort order (%p)', (sortOrder) => {
    expect(() => new SlideEntity({ ...valid, sortOrder })).toThrow(DomainError)
  })

  test('with() returns a changed copy and leaves the original alone', () => {
    const original = new SlideEntity(valid)

    const changed = original.with({ sortOrder: 3, isActive: false })

    expect(changed.toSnapshot()).toEqual({ ...valid, sortOrder: 3, isActive: false })
    expect(original.toSnapshot()).toEqual(valid)
  })

  test('with() enforces the same rules as the constructor', () => {
    expect(() => new SlideEntity(valid).with({ sortOrder: -1 })).toThrow(DomainError)
    expect(() => new SlideEntity(valid).with({ imageKey: '' })).toThrow(DomainError)
  })
})
