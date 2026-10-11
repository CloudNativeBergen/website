import { initTRPC, TRPCError } from '@trpc/server'
import { NextRequest } from 'next/server'
import { getAuthSession } from '@/lib/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isOrganizerForOrg } from '@/lib/authz/organizer'
import type { FeatureId } from '@/lib/features/registry'
import { AppEnvironment } from '@/lib/environment/config'
import {
  readWorkshopSession,
  sessionCookie,
} from '@/lib/workshop/central-sign-in'
import { structuredErrorData, type StructuredErrorData } from './errors'

/**
 * Who is signed in to the workshop portal, projected from the portal's own
 * sealed session (#1311). This is a SEPARATE auth system from the NextAuth
 * (GitHub/LinkedIn) `session` above: NextAuth backs speakers/organizers on
 * `/cfp` and `/admin`, whereas attendees prove an email address through WorkOS
 * on `/workshop`. Workshop signup authorization keys on this, never on
 * client-supplied input.
 */
export interface WorkshopUserIdentity {
  /** The WorkOS user ID: what a signup is stored under. */
  id: string
  email: string
  /**
   * Whether WorkOS has verified this address. The email is what a ticket is
   * matched on, so an unverified one proves nothing about who holds the ticket.
   */
  emailVerified: boolean
  name: string | null
  /**
   * The conference the session was issued for, which claimed the host when
   * this request was read. A procedure compares it with the conference it
   * resolved for the request, which may come from a cache.
   */
  conferenceId: string
}

/**
 * Resolve the attendee identity for a tRPC request from the portal's session
 * cookie (`readWorkshopSession`): sealed for this host and the conference that
 * claims it, checked against the host's record read live. WorkOS is not
 * called, and nothing is written: the session is never renewed.
 *
 * THE SAME DECISION AS THE PAGE, so the API cannot be more permissive than
 * the page. No session resolves to `null`, and a procedure's own guard decides
 * (UNAUTHORIZED for workshop signup/cancel).
 *
 * ONLY FOR `workshop.*` (see {@link namesWorkshopProcedure}): the decision is a
 * live Sanity read, and the cookie rides on every tRPC request this browser
 * makes for a week.
 */
async function resolveWorkshopUser(
  req: NextRequest,
): Promise<WorkshopUserIdentity | null> {
  if (AppEnvironment.isTestMode) return null
  const sealed = req.cookies.get(sessionCookie().name)?.value
  if (!sealed) return null
  if (!namesWorkshopProcedure(req)) return null
  const session = await readWorkshopSession(req.headers, sealed)
  if (!session) return null
  return {
    id: session.userId,
    email: session.email,
    emailVerified: session.emailVerified,
    name: session.name,
    conferenceId: session.conferenceId,
  }
}

/** The app-router key the attendee procedures are mounted under. */
const WORKSHOP_ROUTER_PREFIX = 'workshop.'

/**
 * Whether this HTTP request names a `workshop.*` procedure — the only
 * procedures that consume the attendee identity. tRPC puts the procedure path
 * in the URL (comma-joined for a batch), so this is known before any work.
 *
 * WHY IT EXISTS. The session cookie is host-wide and lasts a week, so without
 * this a browser that once signed in to the portal would spend one live record
 * read on every tRPC request it makes on that host — an organizer's entire
 * admin session included. Fail closed: a request
 * that names none gets no attendee, and a workshop procedure would refuse it.
 */
function namesWorkshopProcedure(req: NextRequest): boolean {
  const marker = '/api/trpc/'
  const { pathname } = req.nextUrl
  const at = pathname.indexOf(marker)
  if (at === -1) return false
  let procedures: string
  try {
    procedures = decodeURIComponent(pathname.slice(at + marker.length))
  } catch {
    return false
  }
  return procedures
    .split(',')
    .some((procedure) => procedure.startsWith(WORKSHOP_ROUTER_PREFIX))
}

export async function createTRPCContext(opts: { req: NextRequest }) {
  const session = await getAuthSession({
    url: opts.req.url,
    headers: opts.req.headers,
  })

  const workosUser = await resolveWorkshopUser(opts.req)

  // Extract IP address from headers
  const forwardedFor = opts.req.headers.get('x-forwarded-for')
  const realIp = opts.req.headers.get('x-real-ip')

  let ipAddress = ''
  if (forwardedFor) {
    ipAddress = forwardedFor.split(',')[0].trim()
  } else if (realIp) {
    ipAddress = realIp
  }

  return {
    req: opts.req,
    session,
    speaker: session?.speaker,
    user: session?.user,
    workosUser,
    ipAddress,
  }
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>

/**
 * Merges the structured-error payload (`code` + `missingFields`) into the tRPC
 * error shape's `data`, so guard rejections survive serialization to the
 * client. Extracted from the formatter config so the wiring is unit-testable.
 */
export function formatTRPCError<
  S extends { data: Record<string, unknown> },
>(opts: {
  shape: S
  error: { code: string; cause?: unknown }
}): Omit<S, 'data'> & { data: S['data'] & StructuredErrorData } {
  const { shape, error } = opts
  return {
    ...shape,
    data: {
      ...shape.data,
      ...structuredErrorData(error),
    },
  }
}

const t = initTRPC.context<Context>().create({
  errorFormatter: formatTRPCError,
})

const requireAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.speaker?._id) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    })
  }

  return next({
    ctx: {
      ...ctx,
      speaker: ctx.session.speaker,
      user: ctx.session.user!,
    },
  })
})

/**
 * THE AUTHORIZATION WAIST (CaaS T1-2, #614). Every `adminProcedure` inherits this
 * single org-scoped organizer check — do NOT re-gate individual endpoints. The
 * request's organization is resolved from the domain conference (never from
 * client input) and the caller must be an organizer OF THAT org
 * (`speaker.organizerOrgIds` includes it). FAIL CLOSED when the org resolves but
 * the caller is not a member AND when the org CANNOT be resolved (unknown domain /
 * transient failure) — post-044-backfill {@link isOrganizerForOrg} denies an
 * unresolvable org. Both migration bridges to the deprecated global
 * `speaker.isOrganizer` are gone, including the legacy-TOKEN one: a pre-#635 token
 * without `organizerOrgIds` is denied everywhere. See `src/lib/authz/organizer.ts`.
 */
const requireAdmin = t.middleware(async ({ ctx, next }) => {
  const orgId = await resolveOrganizationId()
  if (!isOrganizerForOrg(ctx.session?.speaker, orgId)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin privileges required',
    })
  }

  return next({
    ctx: {
      ...ctx,
      // The resolved request org (the tenant the waist gated on) is stashed so
      // admin handlers can scope resource reads to it (e.g. getProposal's
      // organizer branch) without re-resolving the domain conference.
      orgId,
      speaker: ctx.session!.speaker!,
      user: ctx.session!.user!,
    },
  })
})

/**
 * DUAL-ROLE org-scoped organizer resolution (go-live B1-B3/E11, #642). Unlike
 * {@link requireAdmin} this does NOT reject — it resolves the request org from the
 * domain conference and exposes an ORG-SCOPED organizer decision as
 * `ctx.isOrgOrganizer` (plus the resolved `ctx.orgId`) for endpoints that serve
 * BOTH speakers and organizers (a speaker acts on their own resource; an organizer
 * acts on any of the ORG's). It replaces the DEPRECATED GLOBAL `ctx.speaker.isOrganizer`
 * (true for an organizer of ANY org) that dual-role endpoints used to branch on,
 * which let a CNB organizer reach an external tenant's data. The decision reuses
 * {@link isOrganizerForOrg} so its semantics match the waist (#635/#639) exactly.
 * Pure-organizer endpoints should use {@link adminProcedure}
 * (which fails closed); this is for the dual-role surfaces only.
 */
const withOrgOrganizer = t.middleware(async ({ ctx, next }) => {
  const orgId = await resolveOrganizationId()
  return next({
    ctx: {
      ...ctx,
      orgId,
      isOrgOrganizer: isOrganizerForOrg(ctx.session?.speaker, orgId),
      speaker: ctx.session!.speaker!,
      user: ctx.session!.user!,
    },
  })
})

export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(requireAuth)
export const adminProcedure = t.procedure.use(requireAuth).use(requireAdmin)
export const organizerProcedure = t.procedure
  .use(requireAuth)
  .use(withOrgOrganizer)
export const router = t.router

/**
 * Per-organization FEATURE gate. Composes onto the org-scoped procedures —
 * `adminProcedure.use(requireFeature('some-feature'))` — and throws FORBIDDEN
 * (naming the feature) unless the request org's resolved entitlements include
 * it. The org is taken from the upstream middleware's `ctx.orgId` when present
 * (the authz waist already resolved it) and resolved from the domain otherwise;
 * an unresolvable org FAILS CLOSED, matching the waist's posture. Entitlement
 * resolution semantics live in `src/lib/features/registry.ts` +
 * `entitlements.ts` (plan ladder, override-only beta/internal, overrides win,
 * expiry). Imported lazily so this module keeps zero static dependency on the
 * cached entitlements read.
 */
export function requireFeature(featureId: FeatureId) {
  return t.middleware(async ({ ctx, next }) => {
    const upstreamOrgId = (ctx as { orgId?: string | null }).orgId
    const orgId =
      upstreamOrgId !== undefined
        ? upstreamOrgId
        : await resolveOrganizationId()
    if (!orgId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `The "${featureId}" feature requires a resolvable organization`,
      })
    }
    const { getEntitlementsForOrganization } =
      await import('@/lib/features/entitlements')
    const entitled = await getEntitlementsForOrganization(orgId)
    if (!entitled.has(featureId)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `The "${featureId}" feature is not enabled for this organization`,
      })
    }
    return next({ ctx: { ...ctx, orgId } })
  })
}

/**
 * The KILL-SWITCH half of {@link requireFeature}: refuses a procedure when an
 * OPERATOR has explicitly switched `featureId` OFF for the request's
 * organization (an active `featureOverrides` entry with `enabled: false`), and
 * for NO other reason.
 *
 * WHY IT IS NOT `requireFeature` (#836). `requireFeature` asks whether the org
 * is ENTITLED, which folds "never granted" in with "switched off". Several
 * features are deliberately reachable without an entitlement — `ticketing` is
 * enabled for the platform org and for any org holding its OWN provider
 * credentials (`features/ticketing.ts` rule 2), neither of which appears in
 * `computeEntitlements` — so gating those endpoints on entitlement would REMOVE
 * a capability that works today. Concretely: a `community` org whose own
 * credentials resolve keeps the entire ticketing UI by rule 2, and
 * `requireFeature('ticketing')` on this router would 403 the API behind that
 * UI — making the layer that serves the surface STRICTER than the surface,
 * which is the disagreement rule 2 exists to prevent. This middleware honours
 * the operator's DECISION without inventing one where none was made — the same
 * narrow question `resolveTicketingAdminAccess` asks before it resolves a
 * provider, so the API and the UI cannot disagree about who is switched off.
 *
 * WHAT IT DOES NOT DO, precisely:
 *  - It does NOT refuse an org that merely lacks the feature. That is
 *    {@link requireFeature}'s job, and composing both is legitimate.
 *  - It does NOT refuse when the org cannot be resolved, when the org document
 *    is missing, or when the Sanity read REJECTS: those are accidents, not
 *    decisions, and `isFeatureExplicitlyDeniedForOrg` reports them as "not
 *    denied" so one flaky read cannot black out a working tenant. THE HOLE THIS
 *    LEAVES IS REAL: composed onto a procedure that does not itself resolve an
 *    org, an unresolvable request passes this gate. It is closed in practice by
 *    composing onto {@link adminProcedure}, whose waist already FAILS CLOSED on
 *    an unresolvable org — so compose it there, not onto `publicProcedure`.
 */
export function requireFeatureNotDenied(featureId: FeatureId) {
  return t.middleware(async ({ ctx, next }) => {
    const upstreamOrgId = (ctx as { orgId?: string | null }).orgId
    const orgId =
      upstreamOrgId !== undefined
        ? upstreamOrgId
        : await resolveOrganizationId()
    const { isFeatureExplicitlyDeniedForOrg } =
      await import('@/lib/features/platform-default')
    if (await isFeatureExplicitlyDeniedForOrg(orgId, featureId)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `The "${featureId}" feature has been switched off for this organization`,
      })
    }
    return next({ ctx: { ...ctx, orgId } })
  })
}

const CLIENT_ERROR_CODES = new Set([
  'NOT_FOUND',
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'PARSE_ERROR',
])

export function isClientError(code: string): boolean {
  return CLIENT_ERROR_CODES.has(code)
}

export async function resolveConferenceId(): Promise<string> {
  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference?._id) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Could not resolve conference from domain',
    })
  }
  return conference._id
}

/**
 * The REQUEST's organization id, resolved from the domain conference (the tenant
 * key the org-scoped authz waist gates on). Mirrors {@link resolveConferenceId}
 * but returns `null` rather than throwing when the org cannot be resolved
 * (unknown domain / transient read), because the authorization middleware maps
 * that `null` onto a FAIL-CLOSED denial (the org-unresolvable bridge is gone;
 * see `src/lib/authz/organizer.ts`). The underlying conference read is
 * request-cached, so calling this in
 * the waist does not add a fetch for endpoints that also call
 * `resolveConferenceId`.
 */
export async function resolveOrganizationId(): Promise<string | null> {
  try {
    const { conference, error } = await getConferenceForCurrentDomain()
    if (error || !conference?._id) return null
    return conference.organization?._ref ?? null
  } catch {
    // A thrown resolution (no request domain, transient read) must not error the
    // authz waist — it maps to `null`, which the waist now treats as FAIL CLOSED
    // (deny) rather than the removed org-unresolvable bridge.
    return null
  }
}
