// The k6 executor shapes the profiles use (see mix.ts). Pure and free of k6 imports.

export interface Stage {
  duration: string
  target: number
}

export type ScenarioShape =
  | { executor: 'constant-vus'; exec: string; vus: number; duration: string }
  | { executor: 'per-vu-iterations'; exec: string; vus: number; iterations: number; maxDuration: string }
  | { executor: 'ramping-vus'; exec: string; startVUs: number; stages: Stage[]; gracefulRampDown: string }
  | { executor: 'ramping-arrival-rate'; exec: string; startRate: number; timeUnit: string; preAllocatedVUs: number; maxVUs: number; stages: Stage[] }
  | { executor: 'constant-arrival-rate'; exec: string; rate: number; timeUnit: string; duration: string; preAllocatedVUs: number; maxVUs: number }
