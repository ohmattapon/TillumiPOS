// The script k6 runs. The runner picks the profile and the scenario through the environment (see load/lib/k6.ts).
import { config } from './lib/config.ts'
import { profileOptions } from './profiles.ts'

export { catalog } from './scenarios/catalog.ts'

// config() also refuses a BASE_URL that is not this machine, before any request is made.
const { profile, scenario } = config()
export const options = profileOptions(profile, scenario)
