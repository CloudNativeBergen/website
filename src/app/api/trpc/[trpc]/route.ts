import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@/server/_app'
import {
  createTRPCContext,
  isClientError,
  resolveLogTenant,
} from '@/server/trpc'
import { runAfterResponse } from '@/server/runAfterResponse'
import { NextRequest } from 'next/server'

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ req }),
    onError: ({ path, error }) => {
      if (isClientError(error.code)) return
      // onError cannot await, and only failures pay for the tenant lookup,
      // so the line is written once the ids are known.
      runAfterResponse(async () => {
        console.error(
          `tRPC failed on ${path ?? '<no-path>'}:`,
          await resolveLogTenant(),
          error,
        )
      })
    },
  })

// Raises the limit only: a bulk early-access send stops starting sends at
// BULK_TIME_BUDGET_MS, and one that started near it needs the headroom.
export const maxDuration = 60

export { handler as GET, handler as POST }
