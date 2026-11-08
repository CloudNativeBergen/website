// Org kind (#2150): `customer` or `demo`. A demo org (KontainerKonf) runs in
// production with sample data, so it is Pro without billing (effectivePlan),
// never billed, and mails only its own members.
import type { Envelope } from './index'

export const ORG_KINDS = ['customer', 'demo'] as const
export type OrgKind = (typeof ORG_KINDS)[number]

/** Fails safe: anything but `demo` is `customer`. */
export const toOrgKind = (v: unknown): OrgKind =>
  v === 'demo' ? 'demo' : 'customer'

/**
 * The recipients a send may reach. A demo org mails only its own members
 * (compared case-insensitively), so no real attendee or speaker gets mail
 * from sample data. A customer org's list passes through unchanged.
 *
 * Invitations are the one sender that does NOT go through this: a prospect
 * is invited to become a member, so the invite itself must reach a
 * non-member (services/identity deliverInvitation).
 */
export function allowedRecipients(
  kind: Envelope | OrgKind | null | undefined,
  recipients: readonly string[],
  memberEmails: Iterable<string>,
): string[] {
  const k =
    kind && typeof kind === 'object'
      ? toOrgKind(kind.typ === 'tenant' ? kind.orgKind : undefined)
      : toOrgKind(kind)
  if (k !== 'demo') return [...recipients]
  const members = new Set([...memberEmails].map((e) => e.toLowerCase()))
  return recipients.filter((r) => members.has(r.toLowerCase()))
}
