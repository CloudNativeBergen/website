// Invitation delivery and the accept page's lookup (#2130). identity mails
// invitations itself through Resend's REST API with a sending-only key.
import { and, eq, gt, sql } from 'drizzle-orm'
import { rawDb } from './db'
import { invitation, organization, user } from './schema'

export interface MailEnv {
  BETTER_AUTH_URL: string
  /** wrangler secret put RESEND_API_KEY (sending-only); unset, nothing is sent. */
  RESEND_API_KEY?: string
  /** The From header, a wrangler var (service.cue). */
  INVITE_FROM?: string
  /** Invitation emails per org per UTC day, resends included (#2136). */
  INVITE_DAILY_CAP?: string
}

export const DEFAULT_INVITE_DAILY_CAP = 50

export interface InvitationMail {
  invitationId: string
  orgId: string
  email: string
  orgName: string
  inviterName: string
  /** Reply-To, set only when the inviter's email is verified. */
  inviterEmail?: string | null
}

/**
 * The inviter's free-text name, made unfit for phishing (#2136): no URLs,
 * domains or phone numbers, one line, at most 64 characters.
 */
export function inviterDisplayName(name: string) {
  const clean = name
    .replace(/[\p{C}]/gu, ' ')
    .replace(/(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S*/gi, ' ')
    .replace(/\S+\.[a-z]{2,}\b\S*/gi, ' ')
    .replace(/\+?\d[\d\s().-]{5,}\d/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return [...clean].slice(0, 64).join('').trim() || 'A member'
}

/** Counts one send against the org's day; false once the cap is passed. */
async function underCap(d1: D1Database, env: MailEnv, orgId: string) {
  const cap = Number(env.INVITE_DAILY_CAP) || DEFAULT_INVITE_DAILY_CAP
  const day = new Date().toISOString().slice(0, 10)
  const row = await d1
    .prepare(
      'INSERT INTO invite_send_count (org_id, day, n) VALUES (?, ?, 1) ON CONFLICT (org_id, day) DO UPDATE SET n = n + 1 RETURNING n',
    )
    .bind(orgId, day)
    .first<{ n: number }>()
  return (row?.n ?? Infinity) <= cap
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * Sends the invitation email: org name, inviter name and the accept link,
 * nothing else. Not filtered by tenancy's allowedRecipients, demo orgs
 * included (#2150): an operator invites a prospect to become a member, so
 * the invitee is a non-member by definition. Never throws: the invitation row is already written and
 * audited, and the inviter can resend. Returns whether it was sent.
 */
export async function deliverInvitation(
  env: MailEnv,
  d1: D1Database,
  mail: InvitationMail,
): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.INVITE_FROM) {
    console.warn(
      `[invite] RESEND_API_KEY or INVITE_FROM unset; ${mail.invitationId} not mailed`,
    )
    return false
  }
  try {
    if (!(await underCap(d1, env, mail.orgId))) {
      console.warn(
        `[invite] daily cap reached for ${mail.orgId}; ${mail.invitationId} not mailed`,
      )
      return false
    }
  } catch (e) {
    console.error(`[invite] cap check for ${mail.invitationId} failed`, e)
    return false
  }
  const url = `${env.BETTER_AUTH_URL}/invite/${encodeURIComponent(mail.invitationId)}`
  const org = mail.orgName.replace(/[\r\n]/g, ' ')
  const inviter = inviterDisplayName(mail.inviterName)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.INVITE_FROM,
        to: [mail.email],
        ...(mail.inviterEmail ? { reply_to: mail.inviterEmail } : {}),
        subject: `You've been invited to join ${org}`,
        text: `${inviter} has invited you to join ${org}.\n\nReview the invitation: ${url}\n\nSign in with an account that uses this email address. If you were not expecting this, ignore this message: nothing happens until the invitation is accepted.\n`,
        html: `<p><strong>${esc(inviter)}</strong> has invited you to join <strong>${esc(org)}</strong>.</p><p><a href="${esc(url)}">Review invitation</a></p><p>Sign in with an account that uses this email address. If you were not expecting this, ignore this message: nothing happens until the invitation is accepted.</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) return true
    console.error(
      `[invite] Resend refused ${mail.invitationId} (${res.status})`,
    )
  } catch (e) {
    console.error(`[invite] mail for ${mail.invitationId} failed`, e)
  }
  return false
}

/** Org and inviter names for an invitation created outside the plugin. */
export async function namesFor(d1: D1Database, orgId: string, userId: string) {
  const db = rawDb(d1)
  const [o] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId))
  const [u] = await db
    .select({
      name: user.name,
      email: user.email,
      verified: user.emailVerified,
    })
    .from(user)
    .where(eq(user.id, userId))
  return {
    orgName: o?.name ?? '',
    inviterName: u?.name ?? '',
    inviterEmail: u?.verified ? u.email : null,
  }
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
