export type FeatureRouteState = 'wait' | 'show' | 'leave'

/**
 * What a page behind a feature switch does. Until the settings have arrived the switch is only the default,
 * so a bookmarked page of a feature that is off must not render (and fetch) before it can be sent away.
 */
export function featureRoute({ enabled, settled }: { enabled: boolean; settled: boolean }): FeatureRouteState {
  if (!settled) return 'wait'
  return enabled ? 'show' : 'leave'
}
