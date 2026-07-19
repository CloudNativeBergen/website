import { getConferenceTeams } from './sanity'
import { getOrganizerSpeakerIds } from '@/lib/notification/sanity'
import type { TeamKey } from './types'

/**
 * The organizer speaker `_id`s a notification of a given team's kind should be
 * routed to — the ONE fallback contract every routing site shares (TEAMS-2):
 *
 *   team is configured with ≥1 member  → that team's members ONLY;
 *   team absent / configured but empty → the FULL organizer set
 *                                        ({@link getOrganizerSpeakerIds}).
 *
 * This is the single place ABSENT-MEANS-TODAY (every organizer receives
 * everything when no team is configured) is turned into a concrete recipient
 * set, so each call site stays a one-liner: pass the mapped `teamKey` and get
 * back "the right organizers, or all of them."
 *
 * ROUTING ONLY: the returned ids are notification RECIPIENTS. This never gates
 * access, inbox visibility, or participant membership — a team is a soft lens,
 * never an access boundary (see docs/ORGANIZER_TEAMS.md).
 *
 * NEVER-FAIL: a teams-fetch failure must not change who is notified for the
 * worse — it logs and falls back to ALL organizers (today's behaviour), rather
 * than mis-routing to a partial/empty set for the fetch's duration. An empty
 * team is treated identically to an absent one: routing to zero organizers is
 * never the intent, so it collapses to all. (A failure of the organizer fetch
 * itself surfaces to the caller's existing never-fail envelope, exactly as it
 * does today.)
 */
export async function resolveRoutedOrganizerIds({
  conferenceId,
  teamKey,
}: {
  conferenceId: string
  teamKey: TeamKey
}): Promise<string[]> {
  try {
    const teams = await getConferenceTeams(conferenceId)
    const team = teams.find((t) => t.key === teamKey)
    if (team && team.members.length > 0) {
      return [...team.members]
    }
  } catch (error) {
    console.error(
      `resolveRoutedOrganizerIds: teams fetch failed (conference=${conferenceId}, team=${teamKey}); falling back to all organizers`,
      error,
    )
  }
  return getOrganizerSpeakerIds()
}
