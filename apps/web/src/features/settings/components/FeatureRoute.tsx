import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { settingsQuery } from '../api'
import { useFeatures } from '../hooks/use-features'
import { featureRoute } from '../lib/feature-route'

/** Shows a page only when its feature is switched on; otherwise sends the user home. */
export function FeatureRoute({ feature, children }: { feature: keyof ReturnType<typeof useFeatures>; children: ReactNode }) {
  const features = useFeatures()
  const { isPending } = useQuery(settingsQuery)
  const state = featureRoute({ enabled: features[feature], settled: !isPending })
  if (state === 'wait') return null
  if (state === 'leave') return <Navigate to="/" replace />
  return children
}
