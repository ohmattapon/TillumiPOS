import { Elysia } from 'elysia'
import { toErrorResponse } from '../../libs/http-error.factory'
import { AppError } from '../errors'

const PG_UNIQUE_VIOLATION = '23505'
const PG_FOREIGN_KEY_VIOLATION = '23503'

// Drizzle wraps driver errors, so the Postgres error code lives on `cause`.
const pgErrorCode = (error: unknown): string | undefined => {
  const source = (error as { cause?: unknown })?.cause ?? error
  const code = (source as { errno?: unknown })?.errno
  return typeof code === 'string' ? code : undefined
}

export const errorHandler = new Elysia({ name: 'error-handler' })
  .onError({ as: 'global' }, ({ code, error, status }) => {
    // Checked by class: Elysia derives `code` from the error's own `code` field.
    if (error instanceof AppError) return status(error.status, { code: error.code, message: error.message })
    const domainFailure = toErrorResponse(error)
    if (domainFailure) return status(domainFailure.status, domainFailure.body)
    if (code === 'VALIDATION')
      return status(422, { code: 'VALIDATION', message: 'ข้อมูลไม่ถูกต้อง', errors: error.all })
    // Thrown when an upload's actual bytes do not match the allowed file types.
    if (code === 'INVALID_FILE_TYPE')
      return status(422, { code: 'INVALID_FILE_TYPE', message: 'ไฟล์ต้องเป็นรูป JPEG, PNG หรือ WebP' })
    if (code === 'NOT_FOUND') return status(404, { code: 'NOT_FOUND', message: 'ไม่พบเส้นทางที่เรียก' })
    if (code === 'PARSE') return status(400, { code: 'PARSE', message: 'รูปแบบข้อมูลไม่ถูกต้อง' })

    const pgCode = pgErrorCode(error)
    if (pgCode === PG_UNIQUE_VIOLATION) return status(409, { code: 'DUPLICATE', message: 'ข้อมูลซ้ำกับที่มีอยู่แล้ว' })
    if (pgCode === PG_FOREIGN_KEY_VIOLATION)
      return status(409, { code: 'IN_USE', message: 'ข้อมูลนี้ถูกอ้างอิงอยู่ หรืออ้างถึงข้อมูลที่ไม่มีอยู่' })

    console.error(error)
    return status(500, { code: 'INTERNAL', message: 'เกิดข้อผิดพลาดภายในระบบ' })
  })
