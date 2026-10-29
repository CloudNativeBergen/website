/**
 * @vitest-environment jsdom
 *
 * THE COST OF ANNOUNCEMENTS ON THE ATTENDEE PORTAL: one request for the page,
 * however many workshop cards it shows. It used to be one per card.
 *
 * Against the REAL tRPC client and query client, with only `fetch` supplied,
 * so "the query client makes the request once" is observed and not assumed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api, getTRPCClient } from '@/lib/trpc/client'
import WorkshopAnnouncementsSection from './WorkshopAnnouncementsSection'

const BY_WORKSHOP = {
  'ws-1': [
    {
      _id: 'a1',
      body: 'Bring a laptop with Docker installed.',
      createdAt: '2026-10-03T10:00:00Z',
      authorName: 'Ada Lovelace',
    },
  ],
  'ws-2': [
    {
      _id: 'b1',
      body: 'Room changed to Hall B.',
      createdAt: '2026-10-02T12:00:00Z',
      authorName: 'Grace Hopper',
    },
  ],
}

/** The procedures of every tRPC request made, one entry per HTTP request. */
const requests: string[][] = []

beforeEach(() => {
  requests.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(String(input), 'http://localhost')
      const procedures = decodeURIComponent(
        pathname.slice('/api/trpc/'.length),
      ).split(',')
      requests.push(procedures)
      return new Response(
        JSON.stringify(
          procedures.map(() => ({
            result: { data: { success: true, data: BY_WORKSHOP } },
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
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  const [trpcClient] = useState(() => getTRPCClient())
  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  )
}

describe('WorkshopAnnouncementsSection', () => {
  it('asks once for a page of several workshops, and each card shows its own', async () => {
    render(
      <Providers>
        <section data-testid="ws-1">
          <WorkshopAnnouncementsSection workshopId="ws-1" />
        </section>
        <section data-testid="ws-2">
          <WorkshopAnnouncementsSection workshopId="ws-2" />
        </section>
        <section data-testid="ws-3">
          <WorkshopAnnouncementsSection workshopId="ws-3" />
        </section>
      </Providers>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('ws-1').textContent).toContain(
        'Bring a laptop with Docker installed.',
      ),
    )
    expect(screen.getByTestId('ws-1').textContent).not.toContain('Hall B')
    expect(screen.getByTestId('ws-2').textContent).toContain(
      'Room changed to Hall B.',
    )
    expect(screen.getByTestId('ws-2').textContent).not.toContain('Docker')
    // A workshop with no announcements shows neither of the others'.
    expect(screen.getByTestId('ws-3').textContent).not.toMatch(/Docker|Hall B/)

    // ONE request, naming the procedure ONCE: not once per card.
    expect(requests).toEqual([['workshop.announcementsByWorkshop']])
  })

  it.each(['constructor', 'toString', '__proto__'])(
    'renders nothing for a workshop whose id is %s and has no announcements',
    async (workshopId) => {
      render(
        <Providers>
          <section data-testid="odd">
            <WorkshopAnnouncementsSection workshopId={workshopId} />
          </section>
          <section data-testid="ws-1">
            <WorkshopAnnouncementsSection workshopId="ws-1" />
          </section>
        </Providers>,
      )

      await waitFor(() =>
        expect(screen.getByTestId('ws-1').textContent).toContain('Docker'),
      )
      expect(screen.getByTestId('odd').textContent).toBe('')
    },
  )
})
