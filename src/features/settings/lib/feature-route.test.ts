import { expect, test } from 'bun:test'
import { featureRoute } from './feature-route'

test('waits while the settings are still loading, whatever the default says', () => {
  expect(featureRoute({ enabled: true, settled: false })).toBe('wait')
  expect(featureRoute({ enabled: false, settled: false })).toBe('wait')
})

test('shows a feature that is on', () => {
  expect(featureRoute({ enabled: true, settled: true })).toBe('show')
})

test('leaves a feature that is off', () => {
  expect(featureRoute({ enabled: false, settled: true })).toBe('leave')
})
