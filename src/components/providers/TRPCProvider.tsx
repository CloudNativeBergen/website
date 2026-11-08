'use client'

import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { api, getTRPCClient } from '@/lib/trpc/client'
import { useState } from 'react'
import { PlanRequiredNotice } from '@/components/billing'
import { clientPlanRequired, type PlanRequired } from '@/lib/trpc/errors'

interface TRPCProviderProps {
  children: React.ReactNode
}

export function TRPCProvider({ children }: TRPCProviderProps) {
  // Every mutation passes through here: a plan refusal (#2129) shows the
  // upgrade prompt, whatever the caller's own error toast says.
  const [planRequired, setPlanRequired] = useState<PlanRequired | null>(null)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: (error) => {
            const plan = clientPlanRequired(error)
            if (plan) setPlanRequired(plan)
          },
        }),
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
        {planRequired && (
          <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md">
            <PlanRequiredNotice
              {...planRequired}
              onDismiss={() => setPlanRequired(null)}
            />
          </div>
        )}
        {process.env.NODE_ENV === 'development' && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </QueryClientProvider>
    </api.Provider>
  )
}
