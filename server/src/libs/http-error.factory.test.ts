import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { DomainConflictError } from '../domains/errors/domain-conflict.error'
import { DomainError } from '../domains/errors/domain-error'
import { DomainExternalServiceError } from '../domains/errors/domain-external-service.error'
import { DomainForbiddenError } from '../domains/errors/domain-forbidden.error'
import { DomainNotFoundError } from '../domains/errors/domain-not-found.error'
import { DomainUnauthorizedError } from '../domains/errors/domain-unauthorized.error'
import { problem, problemResponse, toProblem } from './http-error.factory'

describe('toProblem', () => {
  test.each([
    [new DomainError('ยอดชำระไม่ครบ', 'UNDERPAID'), 400, 'Bad Request', 'UNDERPAID'],
    [new DomainUnauthorizedError('กรุณาเข้าสู่ระบบ'), 401, 'Unauthorized', 'UNAUTHORIZED'],
    [new DomainForbiddenError('ไม่มีสิทธิ์ใช้งานส่วนนี้'), 403, 'Forbidden', 'FORBIDDEN'],
    [new DomainNotFoundError('ไม่พบหมวดหมู่'), 404, 'Not Found', 'NOT_FOUND'],
    [new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE'), 409, 'Conflict', 'DUPLICATE'],
    [new DomainExternalServiceError('เชื่อมต่อที่เก็บรูปภาพไม่ได้', 'MEDIA_UNAVAILABLE'), 502, 'Bad Gateway', 'MEDIA_UNAVAILABLE'],
  ])('%p becomes a problem with its status, title, code and message', (error, status, title, code) => {
    expect(toProblem(error)).toEqual({ type: 'about:blank', title, status, detail: error.message, code })
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

    expect(toProblem(result.error)).toEqual({
      type: 'about:blank',
      title: 'Unprocessable Content',
      status: 422,
      detail: 'ข้อมูลไม่ถูกต้อง',
      code: 'VALIDATION',
      errors: result.error!.issues,
    })
  })

  test.each([new Error('database exploded'), new TypeError('x is undefined'), 'a string', null, undefined])(
    'anything else (%p) is not translated, so internals never leak',
    (error) => {
      expect(toProblem(error)).toBeNull()
    },
  )
})

describe('params', () => {
  test('are carried onto the problem so a client can rebuild the message', () => {
    const error = new DomainConflictError('เหลือ 1 ชิ้น', 'INSUFFICIENT_STOCK', { name: 'ชา', available: 1 })

    expect(toProblem(error)).toMatchObject({ code: 'INSUFFICIENT_STOCK', params: { name: 'ชา', available: 1 } })
  })

  test('are absent when the error has none', () => {
    expect(toProblem(new DomainNotFoundError('ไม่พบ'))).not.toHaveProperty('params')
  })
})

describe('problem', () => {
  test('omits `errors` unless there are any', () => {
    expect(problem(404, 'NOT_FOUND', 'ไม่พบ')).not.toHaveProperty('errors')
    expect(problem(422, 'VALIDATION', 'ไม่ถูกต้อง', [])).toHaveProperty('errors', [])
  })

  test('an unlisted status still gets a title', () => {
    expect(problem(418, 'TEAPOT', 'x').title).toBe('Error')
  })
})

describe('problemResponse', () => {
  test('carries the problem media type and repeats the status on the response itself', async () => {
    const response = problemResponse(problem(409, 'DUPLICATE', 'ข้อมูลซ้ำกับที่มีอยู่แล้ว'))

    expect(response.status).toBe(409)
    expect(response.headers.get('content-type')).toBe('application/problem+json; charset=utf-8')
    expect(await response.json()).toMatchObject({ status: 409, code: 'DUPLICATE', detail: 'ข้อมูลซ้ำกับที่มีอยู่แล้ว' })
  })
})
