import { clientReadUncached } from '@/lib/sanity/client'
import type { OrganizerTeam } from './types'

/**
 * Per-instance cache TTL for a conference’s teams, mirroring
 * {@link import('@/lib/notification/sanity').getOrganizerSpeakerIds}. Team
 * membership changes are RARE (an admin edits the conference), so a short TTL is
 * an ample freshness bound while collapsing the many per-request reads (every
 * routed notification resolves teams) into ~one read per conference per minute.
 *
 * SERVERLESS NOTE: this cache lives in module scope, so it is PER WARM INSTANCE,
 * not global — each lambda/instance refreshes independently and a cold start
 * always reads fresh. The worst-case staleness any caller can observe is
 * {@link TEAMS_CACHE_TTL_MS} on whichever instance served them.
 */
const TEAMS_CACHE_TTL_MS = 60_000

/** Upper bound on the teams fetch; the team set is tiny in practice. */
const TEAMS_FETCH_LIMIT = 100

const teamsCache = new Map<
  string,
  { teams: OrganizerTeam[]; expiresAt: number }
>()

/**
 * The organizer teams configured on a conference, with each team’s `members`
 * resolved to speaker `_id` strings. Bounded to
 * [0...{@link TEAMS_FETCH_LIMIT}] and cached per instance per conference id for
 * {@link TEAMS_CACHE_TTL_MS}.
 *
 * Returns `[]` when the conference has no teams (or does not exist) — that
 * empty result IS a success and is cached normally, because ABSENT-MEANS-TODAY:
 * an empty team list is the steady state, not an error.
 *
 * ONLY successes are cached: the `await` throws on a failed read BEFORE the
 * cache assignment below, so a transient Sanity failure is never poisoned into
 * the cache as an empty team set for a full TTL.
 *
 * The returned arrays are treated as read-only by callers.
 */
export async function getConferenceTeams(
  conferenceId: string,
): Promise<OrganizerTeam[]> {
  const now = Date.now()
  const cached = teamsCache.get(conferenceId)
  if (cached && cached.expiresAt > now) {
    return cached.teams
  }
  const teams = await clientReadUncached.fetch<OrganizerTeam[] | null>(
    `*[_type == "conference" && _id == $conferenceId][0].teams[0...${TEAMS_FETCH_LIMIT}]{
      _key,
      key,
      title,
      slackChannel,
      emailIdentity,
      "members": members[]._ref
    }`,
    { conferenceId },
  )
  const resolved = (teams || []).map((team) => ({
    ...team,
    members: Array.isArray(team.members) ? team.members : [],
  }))
  teamsCache.set(conferenceId, {
    teams: resolved,
    expiresAt: now + TEAMS_CACHE_TTL_MS,
  })
  return resolved
}

/**
 * Clear the per-instance teams cache. Exposed for tests (which assert fresh
 * reads) and as a hook if a future admin flow wants to invalidate eagerly after
 * editing a conference’s teams.
 */
export function clearConferenceTeamsCache(): void {
  teamsCache.clear()
}
