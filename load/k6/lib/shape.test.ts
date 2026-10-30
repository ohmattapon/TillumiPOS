import { expect, test } from 'bun:test'
import { SELLING_TILLS, shapeOf, usersFor, type ScenarioShape } from './shape'

const mostUsers = (shape: ScenarioShape): number =>
  shape.executor === 'ramping-vus' ? Math.max(shape.startVUs, ...shape.stages.map((stage) => stage.target)) : shape.vus

for (const profile of ['smoke', 'load']) {
  for (const [scenario, tills] of Object.entries(SELLING_TILLS)) {
    test(`${scenario} in ${profile} never runs more virtual users than the shifts setup opens`, () => {
      const opened = usersFor(profile, scenario, tills)
      expect(mostUsers(shapeOf(profile, scenario, opened))).toBeLessThanOrEqual(opened)
      expect(opened).toBeLessThanOrEqual(tills)
    })
  }
}

test('the load profile ramps qr to its own 3 tills, not to the 10 of the cash scenarios', () => {
  expect(mostUsers(shapeOf('load', 'qr', usersFor('load', 'qr', SELLING_TILLS.qr)))).toBe(3)
})

test('a profile without a mix for the scenario is refused', () => {
  expect(() => usersFor('stress', 'checkout', 10)).toThrow('no checkout mix yet')
  expect(() => usersFor('load', 'auth', undefined)).toThrow('no auth mix yet')
})
