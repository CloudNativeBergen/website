/**
 * There is deliberately NO default capacity here. A conference that never set
 * `ticketCapacity` has an unknown one, and the old `DEFAULT_CAPACITY = 250`
 * showed every such tenant a venue size we invented — applied as
 * `ticketCapacity || 250`, which also swallowed a deliberate 0. Unset reads as
 * `0`, and a surface renders that as "no capacity set", never as a percentage
 * of a number nobody configured.
 */
export const DEFAULT_TARGET_CONFIG = {
  enabled: true,
  salesStartDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0],
  targetCurve: 'late_push' as const,
  milestones: [],
}
