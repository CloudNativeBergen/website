/**
 * Organizer teams — SHARED TYPES.
 *
 * Organizer teams are a SOFT LENS over the existing organizer set: they route
 * notifications and outbound mail and drive Studio filters, but they are NEVER
 * an access-control boundary. Every organizer can still see and do everything;
 * teams only change WHO a given message is aimed at by default.
 *
 * ABSENT-MEANS-TODAY: a conference with no `teams` behaves exactly as it does
 * today — all organizers receive everything. The fallback CONTRACT lives with
 * callers (see {@link resolveTeamRecipients}); this module never invents a
 * recipient set of its own.
 *
 * This file is free of `server-only` and of any import that reads secrets or
 * throws at load, so presentational components and tests can import it.
 */

/** The conference email identity a team’s outbound mail is sent as. */
export type TeamEmailIdentity = 'contactEmail' | 'cfpEmail' | 'sponsorEmail'

/**
 * Slack routing kind. `sales` maps to the weekly-update / sponsor channel,
 * everything else (`cfp`) to the CFP channel — mirroring the two conference
 * channel fields.
 */
export type TeamSlackKind = 'sales' | 'cfp'

/**
 * A team key. Free-form string. The routing map (`resolveRoutedOrganizerIds`)
 * consumes a small set of well-known keys — `cfp` (proposal threads / CFP
 * notifications) and `sponsors` (sponsor threads / sales notifications) — but
 * arbitrary additional keys are allowed; nothing enforces an allow-list.
 */
export type TeamKey = string

/**
 * A resolved organizer team. `members` are speaker `_id`s (resolved from the
 * stored references by {@link getConferenceTeams}) — NOT reference objects.
 */
export interface OrganizerTeam {
  _key?: string
  key: string
  title: string
  /** Speaker `_id`s of the team members. */
  members: string[]
  slackChannel?: string
  emailIdentity?: TeamEmailIdentity[]
}

/**
 * The structural slice of a conference the channel/email resolvers need. A full
 * {@link import('@/lib/conference/types').Conference} satisfies this, and so
 * does a small test fixture. Note the resolvers read only `key`, `slackChannel`
 * and `emailIdentity` off each team — never `members` — so the members shape is
 * irrelevant here.
 */
export interface ConferenceTeamsConfig {
  teams?: Array<
    Pick<OrganizerTeam, 'key' | 'slackChannel' | 'emailIdentity'> & {
      title?: string
    }
  >
  salesNotificationChannel?: string
  cfpNotificationChannel?: string
  contactEmail?: string
  cfpEmail?: string
  sponsorEmail?: string
}
