/**
 * Whether this install can take updates from the update screen. Only the native Windows install
 * can (its elevated installer/scripts/apply-update.ps1 does the swap); a Podman or cloud install
 * updates another way, so there the screen is hidden and nothing is fetched.
 */
export interface IUpdateChannel {
  isEnabled(): boolean
}

const updateChannelTokenSymbol: unique symbol = Symbol('IUpdateChannel')
export const updateChannelToken = updateChannelTokenSymbol.toString()
