import { expect, test } from 'bun:test'
import { DEFAULT_KNOBS, PROFILES } from './mix.ts'
import { composeThresholds, stressAbort } from './thresholds.ts'

const own = [{ 'http_req_duration{name:checkout.sale}': ['p(95)<800'], qr_unclaimed: ['count==0'] }]
const compose = (profile: string, knobs = DEFAULT_KNOBS) => composeThresholds({ profile, knobs, sells: true, own, scenarioNames: ['checkout', 'qr'] })
const aborting = (values: unknown[] = []) => values.filter((value) => typeof value === 'object' && (value as { abortOnFail?: boolean }).abortOnFail)

test('only the stress profile aborts on errors', () => {
  for (const profile of PROFILES) {
    const thresholds = compose(profile)
    const expected = profile === 'stress' ? 1 : 0
    expect(aborting(thresholds.expected_failed).length).toBe(expected)
    expect(aborting(thresholds.checks).length).toBe(expected)
  }
})

test('the stress abort delay follows the time-lapse, never below a second', () => {
  expect(stressAbort(DEFAULT_KNOBS).checks).toEqual([{ threshold: 'rate>0.95', abortOnFail: true, delayAbortEval: '60s' }])
  expect(stressAbort({ ...DEFAULT_KNOBS, durationScale: 0.0625 }).expected_failed).toEqual([{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '4s' }])
  expect((stressAbort({ ...DEFAULT_KNOBS, durationScale: 0.001 }).checks![0] as { delayAbortEval: string }).delayAbortEval).toBe('1s')
})

test('baseline mode relaxes latency only: checks, error rates, counters and the stress aborts stay strict', () => {
  const strict = compose('stress')
  const baseline = compose('stress', { ...DEFAULT_KNOBS, baseline: true })
  expect(baseline['http_req_duration{name:checkout.sale}']).toEqual(['max>=0'])
  expect(strict['http_req_duration{name:checkout.sale}']).toEqual(['p(95)<800'])
  for (const key of ['expected_failed', 'checks', 'slot_claim_failed', 'shift_close_failed', 'qr_unclaimed']) expect(baseline[key]).toEqual(strict[key]!)
  expect(baseline.checks).toContain('rate>0.99')
  expect(baseline.expected_failed).toContain('rate<0.01')
})

test('every scenario gets an iterations row, and the shift threshold only when something sells', () => {
  expect(compose('load')['iterations{scenario:qr}']).toEqual(['count>=0'])
  expect(composeThresholds({ profile: 'smoke', knobs: DEFAULT_KNOBS, sells: false, own: [], scenarioNames: ['catalog'] }).shift_close_failed).toBeUndefined()
  expect(compose('smoke').shift_close_failed).toEqual(['count==0'])
})
