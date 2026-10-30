// The slot of this virtual user in its scenario, claimed once from the runner (load/lib/slot-claims.ts). k6 numbers
// virtual users across the whole test and, with several scenarios, not contiguously per scenario, so __VU cannot say
// which register or member slice a VU owns. A VU keeps the slot it claims for the whole run.
import { fail } from 'k6'
import http from 'k6/http'
import { Counter } from 'k6/metrics'
import { isLocalBaseUrl } from './local-url.ts'

/** Claims the runner refused (more VUs than slots) or could not answer; any one fails the run (profiles.ts). */
export const slotClaimFailed = new Counter('slot_claim_failed')

const claimed = new Map<string, number>()

export function claimSlot(scenario: string): number {
  const known = claimed.get(scenario)
  if (known !== undefined) return known
  // The control URL is never printed: it is on this machine, but nothing needs it in the output.
  const base = __ENV.FAKE_BANK_CONTROL_URL
  if (!base || !isLocalBaseUrl(base)) fail('FAKE_BANK_CONTROL_URL is not set to a local address; run this through bun load/run.ts')
  const response = http.request('POST', `${base}/claim/${encodeURIComponent(scenario)}`, null, { tags: { name: 'control.claim' }, responseCallback: http.expectedStatuses(200) })
  const slot = response.status === 200 ? (response.json('slot') as number) : undefined
  if (typeof slot !== 'number') {
    slotClaimFailed.add(1, { scenario })
    fail(`${scenario}: virtual user ${__VU} got no slot (the runner answered ${response.status}); the scenario has more virtual users than slots`)
  }
  claimed.set(scenario, slot)
  return slot
}
