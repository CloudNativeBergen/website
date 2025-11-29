'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { api, getTRPCClient } from '@/lib/trpc/client'
import { useState } from 'react'

interface TRPCProviderProps {
  children: React.ReactNode
}

export function TRPCProvider({ children }: TRPCProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Public data: 60 seconds stale time
            // Authenticated/admin data should override with shorter staleTime (5s)
            staleTime: 60 * 1000,
            gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  )

  const [trpcClient] = useState(() => getTRPCClient())

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
        {process.env.NODE_ENV === 'development' && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </QueryClientProvider>
    </api.Provider>
  )
}
