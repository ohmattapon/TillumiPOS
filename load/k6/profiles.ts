// The load shape of each profile: which scenarios run, how many virtual users and for how long.
import { options as catalogOptions } from './scenarios/catalog.ts'

type Scenarios = Record<string, { executor: 'constant-vus'; exec: string; vus: number; duration: string }>

interface ProfileOptions {
  scenarios: Scenarios
  thresholds: Record<string, string[]>
}

const COMMON_THRESHOLDS = { expected_failed: ['rate<0.01'] }

const SCENARIO_OPTIONS: Record<string, { thresholds: Record<string, string[]> }> = { catalog: catalogOptions }

/** k6 options for a profile and the scenario the runner asked for. Only smoke exists so far; the others come with the scenario mixes. */
export function profileOptions(profile: string, scenario: string): ProfileOptions {
  if (profile !== 'smoke') throw new Error(`The "${profile}" profile has no scenario mix yet; only smoke is available`)
  const scenarioOptions = SCENARIO_OPTIONS[scenario]
  if (!scenarioOptions) throw new Error(`Unknown scenario "${scenario}"`)
  return {
    scenarios: { [scenario]: { executor: 'constant-vus', exec: scenario, vus: 1, duration: '1m' } },
    thresholds: { ...COMMON_THRESHOLDS, ...scenarioOptions.thresholds },
  }
}
