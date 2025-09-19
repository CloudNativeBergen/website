/**
 * Configuration constants for the tickets page
 */

export const SPONSOR_TIER_TICKET_ALLOCATION: Record<string, number> = {
  Pod: 2,
  Service: 3,
  Ingress: 5,
}

export const DEFAULT_TARGET_CONFIG = {
  enabled: true,
  sales_start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0],
  target_curve: 'late_push' as const,
  milestones: [],
}

export const DEFAULT_CAPACITY = 250
