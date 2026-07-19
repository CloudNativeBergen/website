import { getConferenceTeams } from './sanity'
import type {
  ConferenceTeamsConfig,
  TeamEmailIdentity,
  TeamKey,
  TeamSlackKind,
} from './types'

/**
 * The member speaker `_id`s of a conference’s team, or `[]` when the team is
 * absent (or the conference has no teams at all).
 *
 * FALLBACK CONTRACT (lives with the CALLER, not here): an empty result means
 * "no team-specific routing" and the caller MUST fall back to its today’s
 * behaviour — i.e. all organizers receive the message. This function never
 * substitutes the organizer set itself, so that ABSENT-MEANS-TODAY stays a
 * single, explicit decision at the call site.
 */
export async function resolveTeamRecipients({
  conferenceId,
  teamKey,
}: {
  conferenceId: string
  teamKey: TeamKey
}): Promise<string[]> {
  const teams = await getConferenceTeams(conferenceId)
  const team = teams.find((t) => t.key === teamKey)
  return team ? [...team.members] : []
}

/**
 * The Slack channel a team’s notifications of a given `kind` post to:
 * `team.slackChannel` when set, otherwise the conference-level channel for that
 * kind (`sales` → salesNotificationChannel, otherwise cfpNotificationChannel).
 *
 * Returns `undefined` when neither the team nor the conference has a channel —
 * the caller decides whether that means "skip Slack" (today’s behaviour when a
 * conference channel is unset).
 */
export function resolveTeamSlackChannel({
  conference,
  teamKey,
  kind,
}: {
  conference: ConferenceTeamsConfig
  teamKey: TeamKey
  kind: TeamSlackKind
}): string | undefined {
  const team = conference.teams?.find((t) => t.key === teamKey)
  const conferenceChannel =
    kind === 'sales'
      ? conference.salesNotificationChannel
      : conference.cfpNotificationChannel
  return team?.slackChannel ?? conferenceChannel
}

/**
 * The conference email identity a team’s outbound mail is sent as: the address
 * the team’s `emailIdentity` points at (first entry wins — the field is a list
 * for forward-compat, but a team sends AS one identity), falling back to the
 * conference’s general `contactEmail`.
 *
 * Returns `undefined` only when the conference itself has no matching email
 * configured (in practice contactEmail is required, so this is defensive).
 */
export function resolveTeamEmailIdentity(
  conference: ConferenceTeamsConfig,
  teamKey: TeamKey,
): string | undefined {
  const team = conference.teams?.find((t) => t.key === teamKey)
  const identity: TeamEmailIdentity | undefined = team?.emailIdentity?.[0]
  const pointed = identity ? conference[identity] : undefined
  return pointed ?? conference.contactEmail
}
