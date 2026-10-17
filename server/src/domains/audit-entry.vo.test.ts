import { describe, expect, test } from 'bun:test'
import { buildAuditEntry, MAX_AUDIT_JSON_BYTES } from './audit-entry.vo'
import { DomainError } from './errors/domain-error'

const base = { action: 'sale.void', entityType: 'sale', entityId: '412', summary: 'ยกเลิกบิล' }

describe('buildAuditEntry', () => {
  test('retains only a boolean passwordChanged marker while removing credential values', () => {
    for (const passwordChanged of [true, false])
      expect(buildAuditEntry({ ...base, after: { passwordChanged, password: 'secret', passwordHash: 'hash' } }).after)
        .toEqual({ passwordChanged })
    for (const passwordChanged of ['secret', { password: 'secret' }, 1, null])
      expect(buildAuditEntry({ ...base, after: { passwordChanged } }).after).toEqual({})
  })
  test('keeps small JSON values and defaults omitted fields to null', () => {
    expect(buildAuditEntry({ ...base, before: { status: 'completed' }, after: { status: 'voided' } })).toEqual({
      ...base, before: { status: 'completed' }, after: { status: 'voided' }, reason: null,
    })
    expect(buildAuditEntry(base)).toMatchObject({ before: null, after: null, reason: null })
  })
  test('removes secret fields recursively including in arrays without mutating the input', () => {
    const after = { name: 'a', password: 'x', passwordHash: 'y', nested: [{ token: 'z', apiSecret: 's', qrPaymentId: 'bank', id: 1 }] }
    expect(buildAuditEntry({ ...base, after }).after).toEqual({ name: 'a', nested: [{ id: 1 }] })
    expect(after.password).toBe('x')
  })
  test('bounds actual UTF-8 JSON bytes, including Thai and JSON escaping', () => {
    expect(buildAuditEntry({ ...base, after: 'x'.repeat(MAX_AUDIT_JSON_BYTES - 2) }).after).toBe('x'.repeat(MAX_AUDIT_JSON_BYTES - 2))
    for (const after of ['x'.repeat(MAX_AUDIT_JSON_BYTES - 1), 'ก'.repeat(3000), '\n'.repeat(5000)]) {
      const bounded = buildAuditEntry({ ...base, after }).after
      expect(bounded).toEqual({ truncated: true })
      expect(new TextEncoder().encode(JSON.stringify(bounded)).length).toBeLessThanOrEqual(8192)
    }
  })
  test('drops secrets before checking the size', () => {
    expect(buildAuditEntry({ ...base, after: { token: 'x'.repeat(9000), ok: true } }).after).toEqual({ ok: true })
  })
  test('removes bank payment identifiers in common JSON naming styles', () => {
    expect(buildAuditEntry({ ...base, after: { qr_payment_id: 'bank', 'qr-payment-id': 'bank', QRPaymentId: 'bank', id: 12 } }).after).toEqual({ id: 12 })
  })
  test('accepts shared JSON subobjects without treating them as cycles', () => {
    const shared = { status: 'completed' }
    expect(buildAuditEntry({ ...base, after: { first: shared, second: shared } }).after)
      .toEqual({ first: { status: 'completed' }, second: { status: 'completed' } })
  })
  test('rejects non-JSON data with a domain error instead of throwing serialization errors', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    for (const after of [cycle, 1n, NaN, Infinity, () => 1, Symbol('s'), new Date(), { value: undefined }]) {
      expect(() => buildAuditEntry({ ...base, after })).toThrow(DomainError)
      expect(() => buildAuditEntry({ ...base, after })).toThrow(expect.objectContaining({ code: 'INVALID_AUDIT_ENTRY' }))
    }
  })
  test('rejects accessor properties without executing them', () => {
    let accessed = false
    const after = { get value() { accessed = true; return 'unsafe' } }
    expect(() => buildAuditEntry({ ...base, after })).toThrow(DomainError)
    expect(accessed).toBe(false)
  })
  test('rejects empty or whitespace action and summary', () => {
    for (const value of ['', '   ']) {
      expect(() => buildAuditEntry({ ...base, action: value })).toThrow(DomainError)
      expect(() => buildAuditEntry({ ...base, summary: value })).toThrow(DomainError)
    }
  })
})
