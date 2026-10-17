import { expect, test } from 'bun:test'
import { describeEntry, auditChanges } from './describe-entry'

test('uses the recorded summary and falls back to the translated action', () => {
  expect(describeEntry({ summary: 'ยกเลิกบิล', action: 'sale.void' }, (key) => key)).toBe('ยกเลิกบิล')
  expect(describeEntry({ summary: '', action: 'sale.void' }, (key) => key)).toBe('actions.sale.void')
})
test('empty snapshots are safe and only changed fields are displayed', () => {
  expect(auditChanges(null, undefined)).toEqual([])
  expect(auditChanges({ price: 100, name: 'เดิม' }, { price: 200, name: 'เดิม', enabled: true })).toEqual([
    { field: 'price', before: '100', after: '200' },
    { field: 'enabled', before: null, after: 'true' },
  ])
})
