/**
 * Organizer teams — a SOFT LENS (routing / defaults / Studio filters) over the
 * existing organizer set, NEVER an access-control boundary. See
 * {@link import('./types').OrganizerTeam} and docs/ORGANIZER_TEAMS.md for the
 * locked design.
 */
export { clearConferenceTeamsCache } from './sanity'
export { resolveTeamSlackChannel } from './resolve'
export { resolveRoutedOrganizerIds } from './routing'
export { getViewerTeamLens, getViewerTeamKeys } from './viewer'
export { formatTeamSummary } from './format'
