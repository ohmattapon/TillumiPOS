const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'

// Drizzle wraps driver errors, so the PostgreSQL fields live on `cause`.
const sourceOf = (error: unknown) => (error as { cause?: unknown } | null)?.cause ?? error
const codeOf = (error: unknown): unknown => (sourceOf(error) as { errno?: unknown } | null)?.errno

export const isUniqueViolation = (error: unknown) => codeOf(error) === UNIQUE_VIOLATION

export const isForeignKeyViolation = (error: unknown) => codeOf(error) === FOREIGN_KEY_VIOLATION

/** The name of the constraint a violation broke, for telling apart two unique indexes on one table. */
export const violatedConstraint = (error: unknown): string | null => {
  const name = (sourceOf(error) as { constraint?: unknown } | null)?.constraint
  return typeof name === 'string' ? name : null
}
