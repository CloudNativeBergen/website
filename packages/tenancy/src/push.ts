// Web push events (RunKonf/kontroll#61). Identity resolves the recipients and
// sends the push itself (services/identity/src/data/push.ts); conference
// reaches it over identity's `Push` entrypoint. Ids, a role and a conference
// title only: identity looks every other name up itself.

export type PushEvent =
  | {
      type: 'invite.accepted'
      organizationId: string
      invitationId: string
      userId: string
    }
  | {
      type: 'member.role_changed'
      organizationId: string
      userId: string
      role: string
      /** null only if the session is missing, which the route refuses. */
      actorId: string | null
    }
  | {
      type: 'conference.settings_changed'
      organizationId: string
      conferenceId: string
      conferenceName: string | null
      actorId: string
    }
  | { type: 'parity.drift'; conferenceIds: string[] }
  | { type: 'membership.drift'; organizationId: string }

/** What conference may hand to identity's `Push` entrypoint. */
export type ConferencePushEvent = Extract<
  PushEvent,
  { type: 'conference.settings_changed' | 'parity.drift' }
>

/**
 * An operator write in another service, recorded by identity in `audit_event`
 * (docs/AUTHORIZATION.md §3.6). Ids and field names only, never values.
 */
export interface OperatorAuditEvent {
  type: 'operator.write'
  actorId: string
  organizationId: string
  conferenceId: string | null
  fields: string[]
}
