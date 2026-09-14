import { Format } from '@/lib/proposal/types'
import type { InvitationStatus } from './types'

/**
 * Co-speaker limits based on talk format
 * These limits define the maximum number of co-speakers allowed for each format
 * Note: This is in addition to the primary speaker
 */
export const CO_SPEAKER_LIMITS = {
  [Format.lightning_10]: 0,
  [Format.presentation_20]: 1,
  [Format.presentation_25]: 1,
  [Format.presentation_40]: 2,
  [Format.presentation_45]: 2,
  [Format.workshop_120]: 3,
  [Format.workshop_240]: 3,
} as const

export function getCoSpeakerLimit(format: Format): number {
  // Fail closed: an unmapped/legacy format allows no co-speakers rather than
  // silently bypassing the per-format limit. New formats must be added to
  // CO_SPEAKER_LIMITS to opt in.
  return CO_SPEAKER_LIMITS[format] ?? 0
}

export function getTotalSpeakerLimit(format: Format): number {
  return getCoSpeakerLimit(format) + 1
}

export function allowsCoSpeakers(format: Format): boolean {
  return getCoSpeakerLimit(format) > 0
}

/** Number of days a co-speaker invitation stays valid after creation */
export const INVITATION_VALID_DAYS = 14

/**
 * How long an organizer must wait between reminders for the SAME invitation.
 * The invitee did not ask to be here; one nudge a day is the ceiling.
 */
export const INVITATION_REMINDER_COOLDOWN_HOURS = 24

/**
 * Whether a reminder may be sent now. `lastRemindedAt` absent means none has
 * been sent. An UNPARSEABLE timestamp refuses — fail closed rather than let bad
 * data become an unlimited send.
 */
export function reminderCooldownRemainingMs(
  lastRemindedAt: string | undefined,
  now: number = Date.now(),
): number {
  if (!lastRemindedAt) return 0
  const last = new Date(lastRemindedAt).getTime()
  const cooldownMs = INVITATION_REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000
  if (Number.isNaN(last)) return cooldownMs
  return Math.max(0, last + cooldownMs - now)
}

/**
 * Whether an invitation can no longer be responded to: either it was
 * already marked expired, or it is still pending but past its expiry date.
 *
 * EXPIRY IS COMPUTED, NEVER MERELY STORED. The `expired` status is written in
 * exactly one place — the `invitation.respond` path — so it only ever lands
 * when the INVITEE clicks their link. Nobody clicks a dead link, so a lapsed
 * invitation reads `pending` in Sanity forever. Every decision that turns on
 * "is this still open?" must go through here (or {@link isInvitationOpen}),
 * not through `status === 'pending'`.
 */
export function isInvitationExpired(inv: {
  status: string
  expiresAt: string
}): boolean {
  return (
    inv.status === 'expired' ||
    (inv.status === 'pending' && new Date(inv.expiresAt) < new Date())
  )
}

/**
 * Whether an invitation is still live: awaiting a response AND inside its
 * validity window. This — not `status === 'pending'` — is what consumes a
 * co-speaker slot, blocks a duplicate invite, and can be reminded about.
 */
export function isInvitationOpen(inv: {
  status: string
  expiresAt: string
}): boolean {
  return inv.status === 'pending' && !isInvitationExpired(inv)
}

/**
 * The status a caller should see, with a lapsed `pending` reported as
 * `expired`. Read-only: it does not persist the flip (a read path must not
 * become a write path that can fail the read), so the stored value may lag.
 */
export function effectiveInvitationStatus<
  T extends { status: string; expiresAt: string },
>(inv: T): InvitationStatus {
  return isInvitationExpired(inv) ? 'expired' : (inv.status as InvitationStatus)
}

/**
 * How an invitation should be shown in the speaker list. `null` means it has
 * no place there: an accepted invitation is represented by the speaker row it
 * produced, and a canceled one has no ongoing meaning — and `invitation.list`
 * no longer returns either without `includeAll`.
 *
 * Reads `status` directly. The read paths map {@link effectiveInvitationStatus}
 * over `coSpeakerInvitations`, so a lapsed invitation already arrives as
 * `expired`; re-deriving expiry here would be a second source of truth.
 */
export type InvitationDisplayState = 'pending' | 'expired' | 'declined'

export function getInvitationDisplayState(inv: {
  status: string
}): InvitationDisplayState | null {
  switch (inv.status) {
    case 'pending':
    case 'expired':
    case 'declined':
      return inv.status
    default:
      return null
  }
}

/** Whole days from now until `expiresAt`; negative once it has lapsed. */
export function daysUntilExpiry(
  expiresAt: string,
  now: Date = new Date(),
): number {
  const ms = new Date(expiresAt).getTime() - now.getTime()
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

export interface SpeakerRosterCounts {
  confirmed: number
  pending: number
  expired: number
  declined: number
}

/**
 * The one-line roster summary ("1 of 2 confirmed · 1 expired"). Shared so the
 * list heading and any proposal-card chip say the same words.
 *
 * A declined invitation is not counted in the expected total — that person is
 * not coming — but it is still reported, because a silent decline is how a
 * talk ends up one speaker short.
 */
export function summarizeSpeakerRoster(counts: SpeakerRosterCounts): {
  text: string
  tone: 'ok' | 'warn'
} {
  const expected = Math.max(
    counts.confirmed + counts.pending + counts.expired,
    1,
  )
  const parts = [`${counts.confirmed} of ${expected} confirmed`]
  if (counts.expired > 0) parts.push(`${counts.expired} expired`)
  if (counts.declined > 0) parts.push(`${counts.declined} declined`)

  return {
    text: parts.join(' · '),
    tone:
      counts.confirmed < expected || counts.expired > 0 || counts.declined > 0
        ? 'warn'
        : 'ok',
  }
}
