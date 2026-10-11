import 'server-only'
import { z } from 'zod'
import { normalizeDomain } from '@/lib/conference/domains'
import { hostCookie } from './cookies'
import { resolveTenantHost, type SignInHost } from './decision'
import { unseal } from './seal'

/**
 * THE WORKSHOP PORTAL'S OWN SESSION on a tenant host (#1311, spec §6): who
 * signed in, sealed for one host and the conference that claimed it. No WorkOS
 * token is kept and no read calls WorkOS.
 *
 * FIXED 7 DAYS FROM SIGN-IN, NO RENEWAL. The expiry is inside the seal and
 * decides; the cookie's own lifetime only tells the browser when to drop it.
 * A read never writes a cookie.
 */

/** How long a sign-in lasts. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

export const sessionCookie = () => hostCookie('workshop-session')

/** Sealed as `session`. */
export const sessionSchema = z.object({
  /** The WorkOS user ID: what a signup is stored under. */
  userId: z.string().min(1),
  email: z.string(),
  /** Whether WorkOS reported the address verified when they signed in. */
  emailVerified: z.boolean(),
  name: z.string().nullable(),
  /** The WorkOS session, for ending the login at sign-out. */
  sessionId: z.string(),
  /** The host it was issued for. */
  host: z.string(),
  /** The conference that claimed the host then. */
  conferenceId: z.string(),
})

export type WorkshopSession = z.infer<typeof sessionSchema>

/** Was `session` issued for this host, as the conference claims it now? */
export function isSessionFor(
  session: Pick<WorkshopSession, 'host' | 'conferenceId'>,
  tenant: SignInHost,
): boolean {
  return (
    session.host === tenant.destination.host &&
    session.conferenceId === tenant.destination.conference._id
  )
}

export type WorkshopPortal =
  /** The host cannot carry a sign-in (spec §4), or is the auth host. */
  { available: false } | { available: true; session: WorkshopSession | null }

/**
 * THE PORTAL AS THIS REQUEST MAY SEE IT: whether the host can sign anyone in,
 * and who is signed in. A session counts only when all of these hold:
 *
 *  - it unseals as a session and has not expired;
 *  - it was issued for the request's host;
 *  - the host still passes the destination check, read live;
 *  - the conference that claims the host is the one it was issued for.
 *
 * ONE LIVE RECORD READ. `sealed` is the value of {@link sessionCookie}.
 */
export async function readWorkshopPortal(
  headers: { get(name: string): string | null },
  sealed: string | null | undefined,
): Promise<WorkshopPortal> {
  const tenant = await resolveTenantHost(headers)
  if (!tenant) return { available: false }
  const session = await unseal('session', sealed, sessionSchema)
  return {
    available: true,
    session: session && isSessionFor(session, tenant) ? session : null,
  }
}

/**
 * Who is signed in on this request's host, or `null`: the rule of
 * {@link readWorkshopPortal}, with what the request alone decides first. A
 * request that carries no session of ours for this host reads nothing, so
 * this can sit in front of unrelated traffic.
 */
export async function readWorkshopSession(
  headers: { get(name: string): string | null },
  sealed: string | null | undefined,
): Promise<WorkshopSession | null> {
  const session = await sessionOfThisHost(headers, sealed)
  if (!session) return null
  const tenant = await resolveTenantHost(headers)
  return tenant && isSessionFor(session, tenant) ? session : null
}

/**
 * The session `sealed` holds, when it unseals, has not run out and was issued
 * for this request's host. FROM THE REQUEST ALONE: nothing is read, so it does
 * not say the host may still sign anyone in.
 */
export async function sessionOfThisHost(
  headers: { get(name: string): string | null },
  sealed: string | null | undefined,
): Promise<WorkshopSession | null> {
  const session = await unseal('session', sealed, sessionSchema)
  const requestHost = normalizeDomain(headers.get('host') ?? '')
  return session && session.host === requestHost ? session : null
}
