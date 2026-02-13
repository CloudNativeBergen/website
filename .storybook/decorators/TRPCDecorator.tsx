import React, { useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpLink } from '@trpc/client'
import { api } from '@/lib/trpc/client'
import type { Decorator } from '@storybook/nextjs-vite'

// Use httpLink (not httpBatchLink) so each tRPC call is a separate HTTP request
// that MSW can intercept individually
const trpcClient = api.createClient({
  links: [
    httpLink({
      url: '/api/trpc',
    }),
  ],
})

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  })
}

export const TRPCDecorator: Decorator = (Story, context) => {
  // Fresh QueryClient per story so cached data doesn't leak between stories.
  // Keyed on story id so switching stories forces a new cache.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queryClient = useMemo(() => createQueryClient(), [context.id])

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    </api.Provider>
  )
}
