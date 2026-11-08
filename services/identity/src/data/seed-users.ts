// Demo seed users (#2150). The caller (subgraph) has already checked the
// envelope: an operator acting for a demo org. Seed users hold no account or
// password, and auth.ts refuses them any session, so they never log in.
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { rawDb } from './db'
import { MemberError, type MemberRole } from './members'
import { INVITATION_EXPIRES_IN } from './auth'
import { auditEvent, invitation, member, organization, user } from './schema'
import { createSpeakerProfiles, type ProfileInput } from './speaker-profiles'

const bad = (m: string) => new MemberError('BAD_USER_INPUT', m)

/** Only addresses that can never reach a real person. */
export function isSeedEmail(email: string) {
  const to = email.trim().toLowerCase()
  if (!z.email().safeParse(to).success) return false
  const domain = to.slice(to.lastIndexOf('@') + 1)
  return domain === 'example.com' || domain.endsWith('.test')
}

/**
 * Creates or updates a seed user by email, and optionally their membership
 * in `orgId` and their speaker profile. Converges on re-run. Refuses an
 * email that belongs to a real (non-seed) user. Returns the user id.
 */
export async function seedDemoUser(
  d1: D1Database,
  actorId: string,
  orgId: string,
  input: {
    email: string
    name: string
    role?: MemberRole | null
    profile?: ProfileInput | null
  },
): Promise<string> {
  if (!isSeedEmail(input.email))
    throw bad('Seed users need an @example.com or .test address')
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  if (!name || name.length > 200) throw bad('Invalid name')
  const db = rawDb(d1)
  const [org] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, orgId))
  if (!org) throw bad('Unknown organization')

  const [found] = await db
    .select({ id: user.id, isSeed: user.isSeed })
    .from(user)
    .where(eq(sql`lower(${user.email})`, email))
  if (found && !found.isSeed) throw bad('This address belongs to a real user')
  const userId = found?.id ?? crypto.randomUUID()
  const [m] = found
    ? await db
        .select({ id: member.id, role: member.role })
        .from(member)
        .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
    : []

  const writes = [
    found
      ? db.update(user).set({ name }).where(eq(user.id, userId))
      : db.insert(user).values({ id: userId, name, email, isSeed: true }),
    db.insert(auditEvent).values({
      action: 'demo.seed_user',
      userId: actorId,
      subjectUserId: userId,
      detail: JSON.stringify({
        actorId,
        operator: true,
        orgId,
        created: !found,
        role: input.role ?? null,
      }),
    }),
  ] as const
  const memberWrite = !input.role
    ? null
    : m
      ? m.role === input.role
        ? null
        : db.update(member).set({ role: input.role }).where(eq(member.id, m.id))
      : db.insert(member).values({
          id: crypto.randomUUID(),
          organizationId: orgId,
          userId,
          role: input.role,
        })
  await db.batch(memberWrite ? [...writes, memberWrite] : writes)
  if (input.profile)
    await createSpeakerProfiles(d1).update(userId, input.profile)
  return userId
}

export const SEED_INVITATION_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'canceled',
] as const

/**
 * Writes a demo invitation in any state (#2150), for an @example.com or .test
 * address. Never delivered: the audit row records `delivery: skipped_demo`.
 * Converges on re-run: an invitation with the same org, email and status is
 * returned as it is.
 */
export async function seedDemoInvitation(
  d1: D1Database,
  actorId: string,
  orgId: string,
  input: {
    email: string
    role: MemberRole
    status: (typeof SEED_INVITATION_STATUSES)[number]
  },
) {
  if (!isSeedEmail(input.email))
    throw bad('Seed invitations need an @example.com or .test address')
  const email = input.email.trim().toLowerCase()
  const db = rawDb(d1)
  const [found] = await db
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, orgId),
        eq(sql`lower(${invitation.email})`, email),
        eq(invitation.status, input.status),
      ),
    )
  if (found) return found
  const row = {
    id: crypto.randomUUID(),
    organizationId: orgId,
    email,
    role: input.role,
    status: input.status,
    expiresAt: new Date(Date.now() + INVITATION_EXPIRES_IN * 1000),
    inviterId: actorId,
  }
  await db.batch([
    db.insert(invitation).values(row),
    db.insert(auditEvent).values({
      action: 'demo.seed_invitation',
      userId: actorId,
      subjectUserId: actorId,
      detail: JSON.stringify({
        actorId,
        operator: true,
        orgId,
        invitationId: row.id,
        status: row.status,
        delivery: 'skipped_demo',
      }),
    }),
  ])
  return row
}
