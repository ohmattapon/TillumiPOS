import { DomainError } from './errors/domain-error'

export const MAX_AUDIT_JSON_BYTES = 8 * 1024
const SECRET_KEY = /password|hash|secret|token|qr[_-]?payment[_-]?id/i
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface AuditEntryProps {
  action: string
  entityType: string
  entityId: string
  summary: string
  before?: unknown
  after?: unknown
  reason?: string | null
}

export interface AuditEntry {
  action: string
  entityType: string
  entityId: string
  summary: string
  before: JsonValue
  after: JsonValue
  reason: string | null
}

const invalidEntry = () => new DomainError('บันทึกการกระทำไม่ครบหรือมีข้อมูลที่ไม่รองรับ', 'INVALID_AUDIT_ENTRY')

/** Accept plain JSON only, without invoking getters or toJSON methods. */
function scrub(value: unknown, ancestors = new Set<object>(), depth = 0): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'object' || value === null || depth > 100 || ancestors.has(value)) throw invalidEntry()

  const array = Array.isArray(value)
  if (!array && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw invalidEntry()
  ancestors.add(value)
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (array) {
      const items: JsonValue[] = []
      for (let index = 0; index < value.length; index++) {
        const property = descriptors[String(index)]
        if (!property || !('value' in property)) throw invalidEntry()
        items.push(scrub(property.value, ancestors, depth + 1))
      }
      return items
    }
    const entries: [string, JsonValue][] = []
    for (const [key, property] of Object.entries(descriptors)) {
      if (!property.enumerable) continue
      // A boolean records the change without retaining any credential material.
      const safePasswordMarker = key === 'passwordChanged' && 'value' in property && typeof property.value === 'boolean'
      if (SECRET_KEY.test(key) && !safePasswordMarker) continue
      if (!('value' in property)) throw invalidEntry()
      entries.push([key, scrub(property.value, ancestors, depth + 1)])
    }
    return Object.fromEntries(entries)
  } finally {
    ancestors.delete(value)
  }
}

function bounded(value: unknown): JsonValue {
  if (value === undefined) return null
  try {
    const clean = scrub(value)
    return new TextEncoder().encode(JSON.stringify(clean)).byteLength > MAX_AUDIT_JSON_BYTES ? { truncated: true } : clean
  } catch {
    throw invalidEntry()
  }
}

/** Remove secret fields before enforcing the UTF-8 byte limit on each snapshot. */
export function buildAuditEntry(props: AuditEntryProps): AuditEntry {
  if (!props.action.trim() || !props.summary.trim()) throw invalidEntry()
  return {
    action: props.action,
    entityType: props.entityType,
    entityId: props.entityId,
    summary: props.summary,
    before: bounded(props.before),
    after: bounded(props.after),
    reason: props.reason ?? null,
  }
}
