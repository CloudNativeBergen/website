import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink, httpLink, loggerLink, splitLink } from '@trpc/client'
import type { AppRouter } from '@/server/_app'

export const api = createTRPCReact<AppRouter>()

export function getTRPCClient() {
  return api.createClient({
    links: [
      loggerLink({
        enabled: (opts) =>
          opts.direction === 'down' && opts.result instanceof Error,
      }),
      // A batch answers when its slowest call does. A call that waits on a
      // third party (`trpc: { context: { skipBatch: true } }`) goes on its
      // own, so it delays nothing else on the page.
      splitLink({
        condition: (op) => op.context.skipBatch === true,
        true: httpLink({ url: '/api/trpc' }),
        false: httpBatchLink({
          url: '/api/trpc',

          headers() {
            return {}
          },
        }),
      }),
    ],
  })
}
