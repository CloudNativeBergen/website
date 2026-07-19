import { getConferenceTeams } from './sanity'

/**
 * The viewer-scoped team lens for the TEAMS-3 UI surfaces (inbox `my-teams` tab
 * + row chips, the "My areas" dashboard section). It carries BOTH the caller's
 * own team keys (which teams they belong to) and the full set of configured
 * teams (their `key`/`title`, for chip labels and the tab-visibility check).
 *
 * SOFT LENS: nothing here gates access — it only tells the UI which teams exist
 * and which the caller sits on, so an inert lens (no teams, or a caller on no
 * team) can be presented as such. See docs/ORGANIZER_TEAMS.md.
 */
export interface ViewerTeamLens {
  /** Every configured team's stable key + human title (order as stored). */
  teams: { key: string; title: string }[]
  /** The keys of the teams the viewer is a member of (possibly empty). */
  myTeamKeys: string[]
}

/**
 * Resolve the {@link ViewerTeamLens} for a speaker on a conference. Backed by the
 * per-instance-cached {@link getConferenceTeams}, so repeated calls within a
 * request (predicate + tRPC query) collapse to one read.
 */
export async function getViewerTeamLens(
  conferenceId: string,
  speakerId: string,
): Promise<ViewerTeamLens> {
  const teams = await getConferenceTeams(conferenceId)
  return {
    teams: teams.map((t) => ({ key: t.key, title: t.title })),
    myTeamKeys: teams
      .filter((t) => t.members.includes(speakerId))
      .map((t) => t.key),
  }
}

/**
 * The keys of the teams a speaker belongs to on a conference — the `$myTeamKeys`
 * binding the `my-teams` inbox view predicate filters on. Empty when the caller
 * is on no team (the predicate then treats the lens as inert and matches every
 * active thread).
 */
export async function getViewerTeamKeys(
  conferenceId: string,
  speakerId: string,
): Promise<string[]> {
  const teams = await getConferenceTeams(conferenceId)
  return teams.filter((t) => t.members.includes(speakerId)).map((t) => t.key)
}
