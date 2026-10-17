const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'

// Drizzle wraps driver errors, so the PostgreSQL code lives on `cause`.
const codeOf = (error: unknown): unknown => {
  const source = (error as { cause?: unknown } | null)?.cause ?? error
  return (source as { errno?: unknown } | null)?.errno
}

export const isUniqueViolation = (error: unknown) => codeOf(error) === UNIQUE_VIOLATION

export const isForeignKeyViolation = (error: unknown) => codeOf(error) === FOREIGN_KEY_VIOLATION
