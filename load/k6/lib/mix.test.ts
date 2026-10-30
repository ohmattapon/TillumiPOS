import { expect, test } from 'bun:test'
import { MEMBER_SLICES } from './member-slices.ts'
import {
  claimCapacities,
  COMPONENTS,
  DEFAULT_KNOBS,
  defaultScenario,
  parseKnobs,
  PROFILES,
  REGISTERS,
  relaxLatency,
  runnableScenarios,
  scenariosFor,
  SELLING,
  SHOP_DAY,
  TILL_ALLOTMENT,
  tillsFor,
  validateRun,
} from './mix.ts'
import type { ScenarioShape } from './shape.ts'

const mostVus = (shape: ScenarioShape): number => {
  if (shape.executor === 'ramping-arrival-rate' || shape.executor === 'constant-arrival-rate') return Math.max(shape.preAllocatedVUs, shape.maxVUs)
  if (shape.executor === 'ramping-vus') return Math.max(shape.startVUs, ...shape.stages.map((stage) => stage.target))
  return shape.vus
}
const seconds = (duration: string): number => Number(duration.replace(/s$/, ''))
const stagesSeconds = (shape: ScenarioShape): number => ('stages' in shape ? shape.stages.reduce((sum, stage) => sum + seconds(stage.duration), 0) : 0)

test('the shop-day allotment gives checkout 5, orders 3 and qr 2 registers, disjoint, all 10', () => {
  expect(TILL_ALLOTMENT).toEqual({ checkout: { offset: 0, count: 5 }, orders: { offset: 5, count: 3 }, qr: { offset: 8, count: 2 } })
  const registers = SELLING.flatMap((name) => Array.from({ length: TILL_ALLOTMENT[name].count }, (_, index) => TILL_ALLOTMENT[name].offset + index))
  expect(new Set(registers).size).toBe(registers.length)
  expect(registers.every((register) => register >= 0 && register < REGISTERS)).toBe(true)
  expect(registers.length).toBe(REGISTERS)
})

for (const profile of PROFILES) {
  for (const scenario of runnableScenarios(profile)) {
    if (scenario === 'contention') continue
    test(`${profile} / ${scenario}: tills are disjoint, inside the 10 registers, and no executor outgrows them`, () => {
      const tills = tillsFor(profile, scenario)
      const registers = tills.map((till) => till.registerIndex)
      expect(new Set(registers).size).toBe(registers.length)
      expect(registers.every((register) => register >= 0 && register < REGISTERS)).toBe(true)
      // The cashier of a till is the one of its register, so no cashier holds two shifts.
      expect(new Set(tills.map((till) => till.userIndex)).size).toBe(tills.length)
      const shapes = scenariosFor(profile, scenario, DEFAULT_KNOBS)
      const capacities = claimCapacities(profile, scenario)
      for (const name of SELLING) {
        const opened = tills.filter((till) => till.scenario === name)
        // Slot i of a scenario is register offset + i, counted from 0, whatever VU claims it.
        expect(opened.map((till) => till.slot)).toEqual(opened.map((_, index) => index))
        expect(opened.every((till) => till.registerIndex === TILL_ALLOTMENT[name].offset + till.slot)).toBe(true)
        if (!shapes[name]) continue
        expect(mostVus(shapes[name]!)).toBeLessThanOrEqual(opened.length)
        expect(capacities[name]).toBe(opened.length)
      }
      if (shapes.members) {
        expect(mostVus(shapes.members)).toBeLessThanOrEqual(MEMBER_SLICES)
        expect(capacities.members).toBeLessThanOrEqual(MEMBER_SLICES)
      }
      expect(Object.keys(shapes)).not.toContain('contention')
    })
  }
}

test('shop-day runs every part of the shop at once', () => {
  expect(Object.keys(scenariosFor('load', SHOP_DAY, DEFAULT_KNOBS)).sort()).toEqual([...COMPONENTS].sort())
  expect(tillsFor('load', SHOP_DAY).length).toBe(REGISTERS)
})

test('the load profile lasts 10 minutes, and LOAD_DURATION_SCALE shortens it', () => {
  const full = scenariosFor('load', SHOP_DAY, DEFAULT_KNOBS)
  expect(stagesSeconds(full.checkout!)).toBe(600)
  expect((full.reports as { duration: string }).duration).toBe('600s')
  const short = scenariosFor('load', SHOP_DAY, { ...DEFAULT_KNOBS, durationScale: 0.15 })
  expect(stagesSeconds(short.checkout!)).toBe(90)
  expect((short.display as { duration: string }).duration).toBe('90s')
})

test('LOAD_DURATION_SCALE is a time-lapse: the same arrivals of the day in less time', () => {
  const peak = (durationScale: number) => {
    const shape = scenariosFor('load', SHOP_DAY, { ...DEFAULT_KNOBS, durationScale }).checkout as Extract<ScenarioShape, { executor: 'ramping-arrival-rate' }>
    return Math.max(...shape.stages.map((stage) => stage.target))
  }
  expect(peak(0.5)).toBe(peak(1) * 2)
  const reports = (durationScale: number) => (scenariosFor('load', SHOP_DAY, { ...DEFAULT_KNOBS, durationScale }).reports as { rate: number }).rate
  expect(reports(0.5)).toBe(reports(1) * 2)
})

test('the soak profile lasts 45 minutes', () => {
  expect(stagesSeconds(scenariosFor('soak', SHOP_DAY, DEFAULT_KNOBS).checkout!)).toBe(45 * 60)
})

test('LOAD_SCALE multiplies the arrival rates and the peak is the lunch hour', () => {
  const rates = (scale: number) => {
    const shape = scenariosFor('load', SHOP_DAY, { ...DEFAULT_KNOBS, scale }).checkout as Extract<ScenarioShape, { executor: 'ramping-arrival-rate' }>
    return shape.stages.map((stage) => stage.target)
  }
  const full = rates(1)
  // 5 tills x 2 sales a minute at the peak = 600 an hour.
  expect(Math.max(...full)).toBe(600)
  expect(Math.max(...rates(0.2))).toBe(120)
  expect(full.indexOf(600)).toBeGreaterThan(0)
  expect(full.at(-1)!).toBeLessThan(600)
})

test('the spike profile jumps tenfold for one minute and comes back', () => {
  const shape = scenariosFor('spike', SHOP_DAY, DEFAULT_KNOBS).checkout as Extract<ScenarioShape, { executor: 'ramping-arrival-rate' }>
  const base = shape.startRate
  const peak = Math.max(...shape.stages.map((stage) => stage.target))
  expect(peak).toBe(base * 10)
  const held = shape.stages.filter((stage, index) => stage.target === peak && shape.stages[index - 1]?.target === peak)
  expect(held.map((stage) => stage.duration)).toEqual(['60s'])
  expect(shape.stages.at(-1)!.target).toBe(base)
})

test('the stress profile climbs in steps and never steps down', () => {
  const shape = scenariosFor('stress', SHOP_DAY, DEFAULT_KNOBS).checkout as Extract<ScenarioShape, { executor: 'ramping-arrival-rate' }>
  const targets = shape.stages.map((stage) => stage.target)
  for (let index = 1; index < targets.length; index++) expect(targets[index]!).toBeGreaterThanOrEqual(targets[index - 1]!)
  expect(new Set(targets).size).toBeGreaterThan(4)
})

test('an occasional part still runs at least once (a constant rate of at least 1 starts at once)', () => {
  const shapes = scenariosFor('load', SHOP_DAY, { ...DEFAULT_KNOBS, scale: 0.001, durationScale: 1 })
  expect(shapes.stock).toMatchObject({ executor: 'constant-arrival-rate', rate: 1 })
  expect(shapes.reports).toMatchObject({ executor: 'constant-arrival-rate', rate: 1, maxVUs: 1 })
})

test('smoke runs one virtual user for a minute and opens one till for a selling scenario', () => {
  expect(scenariosFor('smoke', 'checkout', DEFAULT_KNOBS)).toEqual({ checkout: { executor: 'constant-vus', exec: 'checkout', vus: 1, duration: '1m' } })
  expect(tillsFor('smoke', 'qr')).toEqual([{ scenario: 'qr', slot: 0, registerIndex: 8, userIndex: 8 }])
  expect(tillsFor('smoke', 'catalog')).toEqual([])
})

test('the profile and scenario pairs that make sense are accepted, the others refused', () => {
  for (const scenario of ['catalog', 'auth', 'checkout', 'orders', 'qr', 'display', 'reports', 'members', 'stock', 'contention']) expect(() => validateRun('smoke', scenario)).not.toThrow()
  expect(() => validateRun('smoke', SHOP_DAY)).toThrow('shop-day')
  for (const profile of ['load', 'stress', 'spike', 'soak']) {
    for (const scenario of [SHOP_DAY, ...COMPONENTS, 'contention']) expect(() => validateRun(profile, scenario)).not.toThrow()
    expect(() => validateRun(profile, 'catalog')).toThrow('smoke')
    expect(() => validateRun(profile, 'auth')).toThrow('smoke')
  }
  expect(() => validateRun('nope', 'checkout')).toThrow('profile')
  expect(() => validateRun('load', 'nope')).toThrow('scenario')
})

test('without --scenario, smoke runs the catalog and every other profile the shop day', () => {
  expect(defaultScenario('smoke')).toBe('catalog')
  for (const profile of ['load', 'stress', 'spike', 'soak']) expect(defaultScenario(profile)).toBe(SHOP_DAY)
})

test('knobs default to 1, 1 and off, and refuse values that are not numbers in range', () => {
  expect(parseKnobs({})).toEqual(DEFAULT_KNOBS)
  expect(DEFAULT_KNOBS).toEqual({ scale: 1, durationScale: 1, baseline: false })
  expect(parseKnobs({ LOAD_SCALE: '0.2', LOAD_DURATION_SCALE: '0.15', LOAD_BASELINE: '1' })).toEqual({ scale: 0.2, durationScale: 0.15, baseline: true })
  expect(parseKnobs({ LOAD_BASELINE: '0' }).baseline).toBe(false)
  for (const bad of ['0', '-1', 'abc', '', '1e9', 'Infinity']) expect(() => parseKnobs({ LOAD_SCALE: bad })).toThrow('LOAD_SCALE')
  for (const bad of ['0', '11', 'x']) expect(() => parseKnobs({ LOAD_DURATION_SCALE: bad })).toThrow('LOAD_DURATION_SCALE')
  expect(() => parseKnobs({ LOAD_BASELINE: 'yes' })).toThrow('LOAD_BASELINE')
})

test('the claims each run allows: the tills of each selling scenario and the member slices', () => {
  expect(claimCapacities('load', SHOP_DAY)).toEqual({ checkout: 5, orders: 3, qr: 2, members: MEMBER_SLICES })
  expect(claimCapacities('smoke', 'orders')).toEqual({ orders: 1 })
  expect(claimCapacities('smoke', 'catalog')).toEqual({})
})

test('baseline mode keeps the latency rows but lets them pass, and leaves every other threshold alone', () => {
  const thresholds = { 'http_req_duration{name:checkout.sale}': ['p(95)<800'], 'http_req_duration{range:year}': ['p(95)<8000'], checks: ['rate>0.99'], qr_unclaimed: ['count==0'] }
  expect(relaxLatency(thresholds)).toEqual({ 'http_req_duration{name:checkout.sale}': ['max>=0'], 'http_req_duration{range:year}': ['max>=0'], checks: ['rate>0.99'], qr_unclaimed: ['count==0'] })
})
