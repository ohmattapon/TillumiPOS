// Lines the runner prints about how to read a run.

/** LOAD_DURATION_SCALE is a time-lapse (stages x f, rates / f), so a compressed run is more intense than the full one. */
export function timeLapseNote(durationScale: number): string | null {
  if (durationScale === 1) return null
  const intensity = (1 / durationScale).toFixed(1)
  return `LOAD_DURATION_SCALE ${durationScale}: this run is time-lapsed (every stage x ${durationScale}, every rate x ${intensity}), so its latency and throughput are not comparable with a full-length run`
}

/**
 * Arrivals k6 could not start because every VU of the scenario was busy. A till serves one customer at a time, so
 * in stress this is the sign the tills are saturated; nothing fails on it, the runner only reports it.
 */
export function droppedNote(profile: string, dropped: number | undefined, iterations: number | undefined): string | null {
  if (!dropped) return null
  const arrivals = dropped + (iterations ?? 0)
  const share = `${dropped} of ${arrivals} arrivals (${((dropped / arrivals) * 100).toFixed(1)}%)`
  if (profile === 'stress') return `Dropped iterations: ${share}: SATURATED, every till was busy for these arrivals; the ceiling of the registers was reached`
  return `Dropped iterations: ${share}: the tills could not take them in time`
}
