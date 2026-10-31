import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@/server/_app'
import { createTRPCContext, isClientError } from '@/server/trpc'
import { NextRequest } from 'next/server'

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ req }),
    onError: ({ path, error }) => {
      if (isClientError(error.code)) return
      console.error(`tRPC failed on ${path ?? '<no-path>'}:`, error)
    },
  })

// Raises the limit only: a bulk early-access send stops starting sends at
// BULK_TIME_BUDGET_MS, and one that started near it needs the headroom. The
// admin Privacy page's erasure (`privacy.erase`) waits FEEDBACK_SETTLE_MS
// (60 s or more) before folding Session Feedback, so it needs more than 60.
export const maxDuration = 300

export { handler as GET, handler as POST }
