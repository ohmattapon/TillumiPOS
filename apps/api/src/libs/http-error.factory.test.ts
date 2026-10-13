import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { DomainConflictError } from '../domains/errors/domain-conflict.error'
import { DomainError } from '../domains/errors/domain-error'
import { DomainExternalServiceError } from '../domains/errors/domain-external-service.error'
import { DomainForbiddenError } from '../domains/errors/domain-forbidden.error'
import { DomainNotFoundError } from '../domains/errors/domain-not-found.error'
import { DomainUnauthorizedError } from '../domains/errors/domain-unauthorized.error'
import { toErrorResponse } from './http-error.factory'

describe('toErrorResponse', () => {
  test.each([
    [new DomainError('ยอดชำระไม่ครบ', 'UNDERPAID'), 400, 'UNDERPAID'],
    [new DomainUnauthorizedError('กรุณาเข้าสู่ระบบ'), 401, 'UNAUTHORIZED'],
    [new DomainForbiddenError('ไม่มีสิทธิ์ใช้งานส่วนนี้'), 403, 'FORBIDDEN'],
    [new DomainNotFoundError('ไม่พบหมวดหมู่'), 404, 'NOT_FOUND'],
    [new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE'), 409, 'DUPLICATE'],
    [new DomainExternalServiceError('เชื่อมต่อที่เก็บรูปภาพไม่ได้', 'MEDIA_UNAVAILABLE'), 502, 'MEDIA_UNAVAILABLE'],
  ])('%p maps to its status and keeps code and message', (error, status, code) => {
    expect(toErrorResponse(error)).toEqual({ status, body: { code, message: error.message } })
  })

  test('each error class has a default code', () => {
    expect(new DomainError('x').code).toBe('BAD_REQUEST')
    expect(new DomainConflictError('x').code).toBe('CONFLICT')
    expect(new DomainExternalServiceError('x').code).toBe('EXTERNAL_SERVICE')
  })

  test('the error name is the class name, so logs identify the kind', () => {
    expect(new DomainNotFoundError('x').name).toBe('DomainNotFoundError')
    expect(new DomainNotFoundError('x')).toBeInstanceOf(DomainError)
  })

  test('a zod failure maps to 422 with the issues attached', () => {
    const result = z.object({ name: z.string().min(1) }).safeParse({ name: '' })

    expect(toErrorResponse(result.error)).toEqual({
      status: 422,
      body: { code: 'VALIDATION', message: 'ข้อมูลไม่ถูกต้อง', errors: result.error!.issues },
    })
  })

  test.each([new Error('database exploded'), new TypeError('x is undefined'), 'a string', null, undefined])(
    'anything else (%p) is not translated, so internals never leak',
    (error) => {
      expect(toErrorResponse(error)).toBeNull()
    },
  )
})
