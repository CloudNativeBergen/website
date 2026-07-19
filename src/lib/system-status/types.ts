/**
 * Types for the admin system-status / self-check registry.
 *
 * This file is intentionally free of `server-only` and of any import that reads
 * secrets or throws at load, so it can be imported by presentational components
 * and Storybook stories. The actual checks live in `./checks` (server-only).
 */

export type CheckStatus = 'ok' | 'warn' | 'error' | 'off'

export type CheckGroup =
  | 'sanity'
  | 'email'
  | 'slack'
  | 'push'
  | 'auth'
  | 'tickets'
  | 'contracts'
  | 'badges'
  | 'invites'
  | 'ops'
  | 'build'
  | 'misc'

/** A single passive system check. Never carries a raw secret — see `checks.ts`. */
export interface SystemCheck {
  id: string
  group: CheckGroup
  label: string
  status: CheckStatus
  /** Plain non-secret value, or a secret fingerprint like `a1b2c3d4 (32 chars)`. */
  value?: string
  /** Human-readable elaboration (what breaks, or the fallback in effect). */
  detail?: string
}

/** Ordered, human-readable labels for each group card. */
export const CHECK_GROUP_LABELS: Record<CheckGroup, string> = {
  sanity: 'Sanity CMS',
  email: 'Email (Resend)',
  slack: 'Slack',
  push: 'Web Push',
  auth: 'Authentication',
  tickets: 'Ticketing (Checkin.no)',
  contracts: 'Contract Signing',
  badges: 'Badges',
  invites: 'Co-speaker Invites',
  ops: 'Cron & Ops',
  build: 'Build & Runtime',
  misc: 'Miscellaneous',
}

/** Card render order. */
export const CHECK_GROUP_ORDER: CheckGroup[] = [
  'build',
  'sanity',
  'auth',
  'email',
  'slack',
  'push',
  'tickets',
  'contracts',
  'badges',
  'invites',
  'ops',
  'misc',
]

/** A group of checks, ready to render as one status card. */
export interface SystemCheckGroup {
  group: CheckGroup
  label: string
  checks: SystemCheck[]
}

/**
 * Narrow slice of the conference document the checks need. Deliberately a
 * structural subset of `Conference` so the page can pass the full doc and tests
 * can pass a small fixture.
 */
export interface ConferenceForSystemChecks {
  _id?: string
  organizer?: string
  cfpEmail?: string
  salesNotificationChannel?: string
  cfpNotificationChannel?: string
  checkinCustomerId?: number
  checkinEventId?: number
}

/** Group a flat registry into ordered, labelled cards (drops empty groups). */
export function groupSystemChecks(checks: SystemCheck[]): SystemCheckGroup[] {
  return CHECK_GROUP_ORDER.map((group) => ({
    group,
    label: CHECK_GROUP_LABELS[group],
    checks: checks.filter((c) => c.group === group),
  })).filter((g) => g.checks.length > 0)
}

/** Roll a set of checks up to the worst status, for a group/section badge. */
export function worstStatus(checks: SystemCheck[]): CheckStatus {
  const rank: Record<CheckStatus, number> = { error: 3, warn: 2, off: 1, ok: 0 }
  return checks.reduce<CheckStatus>((worst, c) => {
    return rank[c.status] > rank[worst] ? c.status : worst
  }, 'ok')
}
