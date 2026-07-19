import { initTRPC, TRPCError } from '@trpc/server'
import { NextRequest } from 'next/server'
import { getAuthSession } from '@/lib/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
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

const requireAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.speaker?.isOrganizer) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin privileges required',
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

export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(requireAuth)
export const adminProcedure = t.procedure.use(requireAuth).use(requireAdmin)
export const router = t.router

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
