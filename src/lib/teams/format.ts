import type { OrganizerTeam } from './types'

/**
 * Pure, render-agnostic summary of a team for the admin settings display:
 * `title (key) — N members · #channel? · identity?`. Extracted so the settings
 * page (a server component with no story infra) can be unit-tested without
 * React. Optional segments (channel, email identity) are omitted when unset.
 */
export function formatTeamSummary(team: OrganizerTeam): string {
  const count = team.members.length
  const parts: string[] = [`${count} member${count === 1 ? '' : 's'}`]
  if (team.slackChannel) {
    parts.push(
      team.slackChannel.startsWith('#')
        ? team.slackChannel
        : `#${team.slackChannel}`,
    )
  }
  if (team.emailIdentity && team.emailIdentity.length > 0) {
    parts.push(team.emailIdentity.join(', '))
  }
  return `${team.title} (${team.key}) — ${parts.join(' · ')}`
}
