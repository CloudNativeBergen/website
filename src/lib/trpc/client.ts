/**
 * tRPC Client Setup
 * This provides the client-side tRPC configuration and React hooks
 */

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
        // You can pass headers here if needed for authentication
        headers() {
          return {
            // Custom headers can go here
          }
        },
      }),
    ],
  })
}
