import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink, loggerLink } from '@trpc/client'
import type { AppRouter } from '@/server/_app'

export const api = createTRPCReact<AppRouter>()

export function getTRPCClient() {
  return api.createClient({
    links: [
      loggerLink({
        enabled: (opts) =>
          process.env.NODE_ENV === 'development' ||
          (opts.direction === 'down' && opts.result instanceof Error),
      }),
      httpBatchLink({
        url: '/api/trpc',

        headers() {
          return {}
        },
      }),
    ],
  })
}
