import { initTRPC, TRPCError } from '@trpc/server'
import { NextRequest } from 'next/server'
import { getAuthSession } from '@/lib/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isOrganizerForOrg } from '@/lib/authz/organizer'
import type { FeatureId } from '@/lib/features/registry'
import { AppEnvironment } from '@/lib/environment/config'
import { structuredErrorData, type StructuredErrorData } from './errors'

/**
 * Identity of an authenticated WorkOS AuthKit user, projected from the sealed
 * `wos-session` cookie. This is a SEPARATE auth system from the NextAuth
 * (GitHub/LinkedIn) `session` above: NextAuth backs speakers/organizers on
 * `/cfp` and `/admin`, whereas WorkOS backs workshop attendees on `/workshop`.
 * Workshop signup authorization keys on this, never on client-supplied input.
 */
export interface WorkshopUserIdentity {
  id: string
  email: string
  firstName?: string | null
  lastName?: string | null
}

/**
 * Resolve the WorkOS attendee identity for a tRPC request from the sealed
 * `wos-session` cookie.
 *
 * Why not `withAuth()`: `withAuth()` reads the session out of a request header
 * that the AuthKit MIDDLEWARE injects, and the middleware matcher only covers
 * `/workshop*` — it does NOT run for `/api/trpc`, so `withAuth()` throws there.
 * Instead we call `authkit(req)`, a public AuthKit helper that reads and unseals
 * the `wos-session` cookie directly (via `getSessionFromCookie`). That cookie is
 * encrypted+signed server-side with `WORKOS_COOKIE_PASSWORD`, so a client cannot
 * forge it — it is a trustworthy, cookie-based server session, exactly the
 * source authorization should bind to.
 *
 * We first cheaply check the cookie is present so the vast majority of tRPC
 * calls (NextAuth admin/cfp/sponsor/message traffic, which carries no WorkOS
 * cookie) skip AuthKit entirely. Any failure resolves to `null` (never throws),
 * so a procedure's own guard decides (UNAUTHORIZED for workshop signup/cancel).
 */
async function resolveWorkshopUser(
  req: NextRequest,
): Promise<WorkshopUserIdentity | null> {
  if (AppEnvironment.isTestMode) return null
  const cookieName = process.env.WORKOS_COOKIE_NAME || 'wos-session'
  if (!req.cookies.get(cookieName)) return null
  try {
    const { authkit } = await import('@workos-inc/authkit-nextjs')
    const { session } = await authkit(req)
    const user = session.user
    if (!user?.id) return null
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    }
  } catch {
    return null
  }
}

export async function createTRPCContext(opts: { req: NextRequest }) {
  let session = await getAuthSession({
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

  // BYPASS AUTH FOR LOCAL TESTING
  if (!session || !session.speaker) {
    session = {
      user: {
        id: "mock-user-id",
        name: "Hans Kristian Flaatten 🕊️🍉",
        email: "hans@flaatten.org",
        role: "admin",
      },
      speaker: {
        _id: "39d98852-b798-49f6-a17e-c438b94c6858", // ID from proposals.json
        _type: "speaker",
        name: "Hans Kristian Flaatten 🕊️🍉",
        email: "hans@flaatten.org",
        organizerOrgIds: ["eb7b16c6-00fa-44a0-adcd-4a480de34242", "cloud-native-bergen"],
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
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
  // BYPASS AUTHZ
  return next({
    ctx: {
      ...ctx,
      orgId: orgId || "eb7b16c6-00fa-44a0-adcd-4a480de34242",
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
  return "eb7b16c6-00fa-44a0-adcd-4a480de34242";
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
