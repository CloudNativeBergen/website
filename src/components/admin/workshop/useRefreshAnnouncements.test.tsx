/**
 * @vitest-environment jsdom
 *
 * After an organizer writes an announcement, BOTH cached reads of it are
 * refetched in this browser: their own per-workshop list and the attendee
 * portal's one read for the conference. Against the real tRPC and query
 * clients, with only `fetch` supplied.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api, getTRPCClient } from '@/lib/trpc/client'
import { useRefreshAnnouncements } from './useRefreshAnnouncements'

/** Every procedure requested, in order, with its input. */
const requested: Array<{ procedure: string; input: unknown }> = []

beforeEach(() => {
  requested.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      const procedures = decodeURIComponent(
        url.pathname.slice('/api/trpc/'.length),
      ).split(',')
      const inputs = JSON.parse(url.searchParams.get('input') ?? '{}')
      procedures.forEach((procedure, i) =>
        requested.push({ procedure, input: inputs[i] }),
      )
      return new Response(
        JSON.stringify(
          procedures.map((procedure) => ({
            result: {
              data:
                procedure === 'workshop.announcementsByWorkshop'
                  ? { success: true, data: {} }
                  : { success: true, data: [], count: 0 },
            },
          })),
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // Fresh for a minute, as in the app: nothing refetches on its own.
        defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
      }),
  )
  const [trpcClient] = useState(() => getTRPCClient())
  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  )
}

let refresh: (workshopId: string) => void

/** Both reads mounted, as an organizer with both pages in one cache has them. */
function BothReads() {
  api.workshop.announcements.useQuery({ workshopId: 'ws-1' })
  api.workshop.announcements.useQuery({ workshopId: 'ws-2' })
  api.workshop.announcementsByWorkshop.useQuery()
  refresh = useRefreshAnnouncements()
  return null
}

const names = () => requested.map((request) => request.procedure).sort()

describe('useRefreshAnnouncements', () => {
  it('refetches that workshop’s list and the portal’s read, and no other workshop’s', async () => {
    render(
      <Providers>
        <BothReads />
      </Providers>,
    )
    await waitFor(() => expect(requested).toHaveLength(3))
    requested.length = 0

    act(() => refresh('ws-1'))

    await waitFor(() => expect(requested).toHaveLength(2))
    expect(names()).toEqual([
      'workshop.announcements',
      'workshop.announcementsByWorkshop',
    ])
    expect(
      requested.find((r) => r.procedure === 'workshop.announcements')?.input,
    ).toEqual({ workshopId: 'ws-1' })
  })
})
