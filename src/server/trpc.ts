import { initTRPC, TRPCError } from '@trpc/server'
import { NextRequest } from 'next/server'
import { getAuthSession } from '@/lib/auth'

export async function createTRPCContext(opts: { req: NextRequest }) {
  const session = await getAuthSession({ url: opts.req.url })

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

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        code: error.code,
      },
    }
  },
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
