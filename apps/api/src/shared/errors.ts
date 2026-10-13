export class AppError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST') => new AppError(400, code, message)
export const unauthorized = (message = 'กรุณาเข้าสู่ระบบ') => new AppError(401, 'UNAUTHORIZED', message)
export const forbidden = (message = 'ไม่มีสิทธิ์ใช้งานส่วนนี้') => new AppError(403, 'FORBIDDEN', message)
export const notFound = (message = 'ไม่พบข้อมูล') => new AppError(404, 'NOT_FOUND', message)
export const conflict = (message: string, code = 'CONFLICT') => new AppError(409, code, message)
