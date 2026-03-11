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

export { handler as GET, handler as POST }
