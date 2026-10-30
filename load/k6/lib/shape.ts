// The virtual users of a profile and the executor that runs them. Pure and free of k6 imports, so a Bun test can
// check it: a selling scenario opens one shift per virtual user in setup, so no executor may ever ask for more users
// than that (shape.test.ts).

export interface Stage {
  duration: string
  target: number
}

export type ScenarioShape =
  | { executor: 'constant-vus'; exec: string; vus: number; duration: string }
  | { executor: 'per-vu-iterations'; exec: string; vus: number; iterations: number; maxDuration: string }
  | { executor: 'ramping-vus'; exec: string; startVUs: number; stages: Stage[]; gracefulRampDown: string }

/** Every register holds one open shift, and the seed has 10 registers, so a selling scenario never runs more than 10 users. */
export const TILLS = 10
export const QR_TILLS = 3

/** The tills (and so the most virtual users) of each scenario that sells. */
export const SELLING_TILLS: Record<string, number> = { checkout: TILLS, orders: TILLS, qr: QR_TILLS }

/** Ramp up to `users`, hold, ramp down. */
export function rampStages(users: number): Stage[] {
  return [
    { duration: '30s', target: users },
    { duration: '2m', target: users },
    { duration: '30s', target: 0 },
  ]
}

/** How many virtual users run a scenario in the profile; `tills` is set for a scenario that sells. */
export function usersFor(profile: string, scenario: string, tills: number | undefined): number {
  if (profile === 'smoke') return 1
  if (profile === 'load' && tills) return tills
  throw new Error(`The "${profile}" profile has no ${scenario} mix yet`)
}

/** Smoke runs the users for a minute; load ramps to the same users, never more. */
export function shapeOf(profile: string, scenario: string, users: number): ScenarioShape {
  return profile === 'load'
    ? { executor: 'ramping-vus', exec: scenario, startVUs: 0, stages: rampStages(users), gracefulRampDown: '30s' }
    : { executor: 'constant-vus', exec: scenario, vus: users, duration: '1m' }
}
