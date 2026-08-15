export const DEFAULT_TARGET_CONFIG = {
  enabled: true,
  salesStartDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0],
  targetCurve: 'late_push' as const,
  milestones: [],
}

export const DEFAULT_CAPACITY = 250
