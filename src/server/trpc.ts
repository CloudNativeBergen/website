import { initTRPC, TRPCError } from '@trpc/server'
import { NextRequest } from 'next/server'
import { getAuthSession } from '@/lib/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { structuredErrorData, type StructuredErrorData } from './errors'

export async function createTRPCContext(opts: { req: NextRequest }) {
  const session = await getAuthSession({
    url: opts.req.url,
    headers: opts.req.headers,
  })

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
