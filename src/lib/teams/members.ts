import type { OrganizerTeam } from './types'

/**
 * The member speaker-id set of the team with `key`, or `undefined` when no team
 * matches (or no key/teams given). Pure and free of any server import so the
 * sponsor CRM client (TEAMS-3 L3) can map a selected `team=<key>` URL param to
 * the assignee id set it filters on, and unit tests can exercise the mapping
 * directly.
 *
 * A matched team with zero members returns `[]` (not `undefined`) — the caller
 * treats that as "match nobody", distinct from "no team filter".
 */
export function teamMembersForKey(
  teams: Pick<OrganizerTeam, 'key' | 'members'>[] | undefined,
  key: string | undefined | null,
): string[] | undefined {
  if (!key || !teams) return undefined
  return teams.find((t) => t.key === key)?.members
}
