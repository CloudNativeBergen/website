/**
 * Organizer teams — a SOFT LENS (routing / defaults / Studio filters) over the
 * existing organizer set, NEVER an access-control boundary. See {@link OrganizerTeam}
 * and docs/ORGANIZER_TEAMS.md for the locked design.
 */
export {
  type OrganizerTeam,
  type ConferenceTeamsConfig,
  type TeamKey,
  type TeamEmailIdentity,
  type TeamSlackKind,
} from './types'
export { getConferenceTeams, clearConferenceTeamsCache } from './sanity'
export {
  resolveTeamRecipients,
  resolveTeamSlackChannel,
  resolveTeamEmailIdentity,
} from './resolve'
export { resolveRoutedOrganizerIds } from './routing'
export {
  getViewerTeamLens,
  getViewerTeamKeys,
  type ViewerTeamLens,
} from './viewer'
export { formatTeamSummary } from './format'
export { teamMembersForKey } from './members'
export { TEAM_KEY_PATTERN, isValidTeamKey, countTeamKey } from './validation'
