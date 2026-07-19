/**
 * Thread → routing-team derivation for the TEAMS-3 inbox lenses.
 *
 * A conversation's ROUTING TEAM is the well-known team key its notifications fan
 * out to (see docs/ORGANIZER_TEAMS.md / TEAMS-2): a `sponsor` thread routes to
 * the `sponsors` team, everything else (`proposal` / `general`) to `cfp`. These
 * are the only two keys inbox threads map to, so both the `my-teams` view
 * predicate and the per-row team CHIP derive from this single mapping.
 *
 * This module is intentionally free of any server import so client components
 * (the inbox rows) and unit tests can use it directly.
 */
import type { ConversationType } from './types'

/** The well-known routing team key an inbox thread of this type belongs to. */
export function routingTeamKeyForType(
  conversationType: ConversationType,
): 'sponsors' | 'cfp' {
  return conversationType === 'sponsor' ? 'sponsors' : 'cfp'
}

/**
 * The resolved TITLES of the two routing teams, as configured on the conference
 * (`undefined` when that team is absent or unnamed). The inbox passes this down
 * to the rows so a chip can show the human team label; `undefined`/empty means
 * "no teams configured" and the chips are suppressed entirely.
 */
export interface RoutingTeamTitles {
  sponsors?: string
  cfp?: string
}

/**
 * A row's team chip. `tone` distinguishes the SPONSOR chip (amber — preserves the
 * existing sponsor visual identity, and REPLACES the standalone "Sponsor" chip so
 * the two never both shout) from a generic `team` chip (a routed non-sponsor
 * thread). Returns `null` when no chip should render: the speaker audience, no
 * teams configured, or the mapped team having no configured title.
 */
export interface ThreadTeamChip {
  label: string
  tone: 'sponsor' | 'team'
}

/**
 * Derive the team chip for one inbox row (organizer audience only). The chip's
 * label is the mapped routing team's configured TITLE; when that team is not
 * configured the chip is suppressed (the caller falls back to today's rendering —
 * a bare "Sponsor" chip for a sponsor row, nothing for the rest).
 */
export function deriveThreadTeamChip(
  conversationType: ConversationType,
  routingTeamTitles: RoutingTeamTitles | undefined,
): ThreadTeamChip | null {
  if (!routingTeamTitles) return null
  const key = routingTeamKeyForType(conversationType)
  const title = routingTeamTitles[key]
  if (!title) return null
  return { label: title, tone: key === 'sponsors' ? 'sponsor' : 'team' }
}
