import { describe, expect, test } from 'bun:test'
import { makeShift } from '../../../../__tests__/factories'
import { mockShiftRepository } from '../../../../__tests__/mocks'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { GetShiftUseCase } from './get-shift.usecase'

describe('GetShiftUseCase', () => {
  test('returns the shift of the branch it is asked in', async () => {
    const shifts = mockShiftRepository()
    shifts.findById.mockResolvedValue(makeShift({ id: 7 }))

    const shift = await new GetShiftUseCase(shifts).execute(7, 1)

    expect(shift.id).toBe(7)
    expect(shifts.findById).toHaveBeenCalledWith(7, 1)
  })

  test('a shift that is missing, or belongs to another branch, is not found', async () => {
    const shifts = mockShiftRepository()
    shifts.findById.mockResolvedValue(null)

    const attempt = new GetShiftUseCase(shifts).execute(7, 2)

    await expect(attempt).rejects.toBeInstanceOf(DomainNotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'SHIFT_NOT_FOUND' })
  })
})
