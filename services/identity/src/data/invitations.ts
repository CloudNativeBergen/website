// Invitation delivery and the accept page's lookup (#2130). The email is sent
// by the site (Resend) through tenant-directory, which already signs site
// service calls (PROVISIONING_SIGNING_KEY): no mail secret on this worker.
import { and, eq, gt, sql } from 'drizzle-orm'
import { rawDb } from './db'
import { invitation, organization, user } from './schema'

/** What the site's invitation route gets: nothing beyond these four fields. */
export interface InvitationMail {
  invitationId: string
  email: string
  orgId: string
  orgName: string
  inviterName: string
}

/** tenant-directory's `SiteMail` entrypoint (services/tenant-directory/src/index.ts). */
export interface SiteMail {
  invitation(mail: InvitationMail & { inviterId: string }): Promise<unknown>
}

/**
 * Sends the invitation email. Never throws: the invitation row is already
 * written and audited, and the inviter can resend. Unbound (preview, tests)
 * sends nothing.
 */
export async function deliverInvitation(
  siteMail: SiteMail | undefined,
  mail: InvitationMail & { inviterId: string },
) {
  if (!siteMail) {
    console.warn(`[invite] SITE_MAIL unbound; ${mail.invitationId} not mailed`)
    return
  }
  try {
    await siteMail.invitation(mail)
  } catch (e) {
    console.error(`[invite] mail for ${mail.invitationId} failed`, e)
  }
}

/** Org and inviter names for an invitation created outside the plugin. */
export async function namesFor(d1: D1Database, orgId: string, userId: string) {
  const db = rawDb(d1)
  const [o] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId))
  const [u] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId))
  return { orgName: o?.name ?? '', inviterName: u?.name ?? '' }
}

/**
 * The org of a pending, unexpired invitation addressed to `email`, or null.
 * Unknown, someone else's, expired and used all look the same.
 */
export async function openInvitationFor(
  d1: D1Database,
  id: string,
  email: string,
) {
  const [row] = await rawDb(d1)
    .select({ orgId: invitation.organizationId, orgName: organization.name })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(
      and(
        eq(invitation.id, id),
        eq(sql`lower(${invitation.email})`, email.toLowerCase()),
        eq(invitation.status, 'pending'),
        gt(invitation.expiresAt, new Date()),
      ),
    )
  return row ?? null
}
