/**
 * tRPC Server Setup
 * Base configuration for tRPC server including context creation and middleware
 */

import { initTRPC, TRPCError } from '@trpc/server'
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

// Context creation - runs for every tRPC request
export async function createTRPCContext(opts: { req: NextRequest }) {
  const session = await auth()

  return {
    req: opts.req,
    session,
    speaker: session?.speaker,
    user: session?.user,
  }
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>

// Initialize tRPC
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

// Middleware for authentication
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

// Middleware for admin/organizer access
const requireAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.speaker?.is_organizer) {
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

// Procedure builders
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(requireAuth)
export const adminProcedure = t.procedure.use(requireAuth).use(requireAdmin)
export const router = t.router
export const middleware = t.middleware
