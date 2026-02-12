import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import { api } from '@/lib/trpc/client'
import type { Decorator } from '@storybook/nextjs-vite'

// Create these outside the decorator to avoid recreating on every render
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    },
  },
})

const trpcClient = api.createClient({
  links: [
    httpBatchLink({
      url: 'http://localhost:6006/api/trpc',
      // MSW will intercept these requests
    }),
  ],
})

export const TRPCDecorator: Decorator = (Story) => {
  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    </api.Provider>
  )
}
