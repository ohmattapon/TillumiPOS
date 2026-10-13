import { Elysia } from 'elysia'
import { toErrorResponse } from '../libs/http-error.factory'

/** Turns every failure into the API's `{ code, message }` error body. */
export const errorHandler = new Elysia({ name: 'error-handler' }).onError(
  { as: 'global' },
  ({ code, error, status }) => {
    // Domain failures first, and by class: Elysia derives `code` from an error's own `code` field,
    // so a domain error coded NOT_FOUND would otherwise be mistaken for an unknown route.
    const domainFailure = toErrorResponse(error)
    if (domainFailure) return status(domainFailure.status, domainFailure.body)

    if (code === 'VALIDATION')
      return status(422, { code: 'VALIDATION', message: 'ข้อมูลไม่ถูกต้อง', errors: error.all })
    // Thrown when an upload's actual bytes do not match the allowed file types.
    if (code === 'INVALID_FILE_TYPE')
      return status(422, { code: 'INVALID_FILE_TYPE', message: 'ไฟล์ต้องเป็นรูป JPEG, PNG หรือ WebP' })
    if (code === 'NOT_FOUND') return status(404, { code: 'NOT_FOUND', message: 'ไม่พบเส้นทางที่เรียก' })
    if (code === 'PARSE') return status(400, { code: 'PARSE', message: 'รูปแบบข้อมูลไม่ถูกต้อง' })

    // Anything else is a bug or an outage: log it, and tell the client nothing about the internals.
    console.error(error)
    return status(500, { code: 'INTERNAL', message: 'เกิดข้อผิดพลาดภายในระบบ' })
  },
)
