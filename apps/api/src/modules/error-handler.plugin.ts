import { Elysia } from 'elysia'
import { problem, problemResponse, toProblem } from '../libs/http-error.factory'

/** Turns every failure into an RFC 9457 problem response. */
export const errorHandler = new Elysia({ name: 'error-handler' }).onError({ as: 'global' }, ({ code, error }) => {
  // Domain failures first, and by class: Elysia derives `code` from an error's own `code` field,
  // so a domain error coded NOT_FOUND would otherwise be mistaken for an unknown route.
  const domainFailure = toProblem(error)
  if (domainFailure) return problemResponse(domainFailure)

  if (code === 'VALIDATION') return problemResponse(problem(422, 'VALIDATION', 'ข้อมูลไม่ถูกต้อง', error.all))
  // Thrown when an upload's actual bytes do not match the allowed file types.
  if (code === 'INVALID_FILE_TYPE')
    return problemResponse(problem(422, 'INVALID_FILE_TYPE', 'ไฟล์ต้องเป็นรูป JPEG, PNG หรือ WebP'))
  if (code === 'NOT_FOUND') return problemResponse(problem(404, 'NOT_FOUND', 'ไม่พบเส้นทางที่เรียก'))
  if (code === 'PARSE') return problemResponse(problem(400, 'PARSE', 'รูปแบบข้อมูลไม่ถูกต้อง'))

  // Anything else is a bug or an outage: log it, and tell the client nothing about the internals.
  console.error(error)
  return problemResponse(problem(500, 'INTERNAL', 'เกิดข้อผิดพลาดภายในระบบ'))
})
