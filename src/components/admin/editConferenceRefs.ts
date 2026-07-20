/**
 * Pure, React-free helpers for the SE-2 reference/teams editors
 * ({@link ./OrganizersEditor}, {@link ./TopicsEditor}, {@link ./TeamsEditor}).
 * Extracted so payload-shaping and validation are unit-testable under vitest
 * without rendering — the components wire these into form state and the tests
 * assert them directly (the SE-1b `editConferenceLists` pattern).
 *
 * The SERVER (conference router + zod schemas) is the authority; these mirror it
 * for immediate client feedback only.
 */

import { TEAM_KEY_PATTERN } from '@/lib/teams/validation'
import type { TeamEmailIdentity } from '@/lib/teams/types'

/** A `_key` minted client-side for a brand-new row; the server re-keys these. */
export const TEMP_KEY_PREFIX = 'tmp-'

/** The three conference email identities a team may send as. */
export const TEAM_EMAIL_IDENTITY_OPTIONS: readonly {
  value: TeamEmailIdentity
  title: string
}[] = [
  { value: 'contactEmail', title: 'Contact Email' },
  { value: 'cfpEmail', title: 'CFP Email' },
  { value: 'sponsorEmail', title: 'Sponsor Email' },
]

// === Organizers ============================================================

/**
 * Validate the organizer id list against the acting organizer's id. Mirrors the
 * server: non-empty ALWAYS, and the caller may not remove THEMSELVES (that would
 * revoke their own admin access). Removing other organizers is allowed.
 */
export function validateOrganizers(
  ids: string[],
  selfId: string,
): string | null {
  if (ids.length === 0) return 'At least one organizer is required'
  if (!ids.includes(selfId)) {
    return 'You cannot remove yourself from the organizer team'
  }
  return null
}

// === Team key ==============================================================

/** Reduce a title to a lowercase kebab-case team key candidate. */
export function slugifyTeamKey(title: string): string {
  return (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** True when `key` is a non-empty lowercase kebab-case string. */
export function isValidTeamKeyClient(key: string): boolean {
  return TEAM_KEY_PATTERN.test(key)
}

// === Teams =================================================================

/** A team row in the editor's form state (single-select email identity). */
export interface TeamFormRow {
  _key: string
  key: string
  title: string
  members: string[]
  slackChannel: string
  /** Single-select in the UI; serialized to a 0/1-length array on save. */
  emailIdentity: '' | TeamEmailIdentity
}

/** The wire shape one team is submitted as. */
export interface TeamPayload {
  key: string
  title: string
  members: string[]
  slackChannel?: string
  emailIdentity?: TeamEmailIdentity[]
  _key?: string
}

/**
 * Validate the whole teams form against the current organizer id set. Errors are
 * keyed `<rowIndex>.<field>` (`title`, `key`, `members`). Mirrors the server:
 *   - title required
 *   - key required, kebab-case, UNIQUE across rows
 *   - members ≥1 and every member ∈ organizers (subset)
 */
export function validateTeams(
  rows: TeamFormRow[],
  organizerIds: string[],
): Record<string, string> {
  const errs: Record<string, string> = {}
  const organizerSet = new Set(organizerIds)
  const keyCounts = new Map<string, number>()
  for (const r of rows) {
    const k = r.key.trim()
    if (k) keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1)
  }
  rows.forEach((row, i) => {
    if (row.title.trim() === '') errs[`${i}.title`] = 'Title is required'
    const key = row.key.trim()
    if (key === '') {
      errs[`${i}.key`] = 'Key is required'
    } else if (!isValidTeamKeyClient(key)) {
      errs[`${i}.key`] = 'Key must be lowercase kebab-case'
    } else if ((keyCounts.get(key) ?? 0) > 1) {
      errs[`${i}.key`] = `Duplicate key "${key}"`
    }
    if (row.members.length === 0) {
      errs[`${i}.members`] = 'A team needs at least one member'
    } else if (row.members.some((m) => !organizerSet.has(m))) {
      errs[`${i}.members`] = 'Members must be organizers of this conference'
    }
  })
  return errs
}

/** Shape the teams form into the mutation payload (drops empty optionals). */
export function buildTeamsPayload(rows: TeamFormRow[]): TeamPayload[] {
  return rows.map((row) => {
    const slack = row.slackChannel.trim()
    const payload: TeamPayload = {
      key: row.key.trim(),
      title: row.title.trim(),
      members: row.members,
    }
    if (slack !== '') payload.slackChannel = slack
    if (row.emailIdentity !== '') payload.emailIdentity = [row.emailIdentity]
    if (row._key && !row._key.startsWith(TEMP_KEY_PREFIX)) {
      payload._key = row._key
    }
    return payload
  })
}
