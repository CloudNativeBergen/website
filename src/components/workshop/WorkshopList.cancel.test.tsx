/**
 * @vitest-environment jsdom
 *
 * An attendee's cancel deletes the sign-up (#1331), so a SECOND cancel of the
 * same sign-up is refused with "Signup not found". The card keeps showing the
 * old sign-up until the attendee's sign-ups have been read again, and for that
 * one round trip its cancel button must not be available: a second click would
 * put an error over a cancel that worked. (Before #1331 the second cancel set
 * `waitlist` again and nobody noticed.)
 *
 * Against the real tRPC client and query client, with only `fetch` supplied.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api, getTRPCClient } from '@/lib/trpc/client'
import WorkshopList from './WorkshopList'

const WORKSHOP = {
  _id: 'ws-1',
  title: 'Kubernetes 101',
  format: 'workshop_120',
  capacity: 30,
  signups: 12,
  available: 18,
  waitlistCount: 0,
  date: '2026-09-10',
  startTime: '09:00',
  endTime: '11:00',
  room: 'Room A',
  description: 'Hands-on.',
  speakers: [],
  topics: [],
}

const SIGNUP = {
  _id: 'signup-1',
  _type: 'workshopSignup',
  status: 'confirmed',
  workshop: { _type: 'reference', _ref: 'ws-1' },
}

const server = {
  /** The stored state: the sign-up is there until a cancel deletes it. */
  signedUp: true,
  cancels: 0,
  signupReads: 0,
  /** While set, a read of the attendee's sign-ups AFTER the cancel waits on it. */
  hold: null as Promise<void> | null,
}

const ok = (data: unknown) => ({ result: { data } })

async function answer(procedure: string): Promise<[unknown, number]> {
  switch (procedure) {
    case 'workshop.list':
      return [ok({ success: true, data: [WORKSHOP], count: 1 }), 200]
    case 'workshop.getMySignups': {
      server.signupReads += 1
      if (!server.signedUp && server.hold) await server.hold
      const data = server.signedUp ? [SIGNUP] : []
      return [ok({ success: true, data, count: data.length }), 200]
    }
    case 'workshop.announcementsByWorkshop':
      return [ok({ success: true, data: {} }), 200]
    case 'workshop.cancelSignup': {
      server.cancels += 1
      // As the real procedure: a sign-up that is gone cannot be cancelled.
      if (!server.signedUp) {
        return [
          {
            error: {
              message: 'Signup not found',
              code: -32004,
              data: { code: 'NOT_FOUND', httpStatus: 404 },
            },
          },
          404,
        ]
      }
      server.signedUp = false
      return [ok({ success: true, message: 'cancelled' }), 200]
    }
    default:
      throw new Error(`unexpected procedure ${procedure}`)
  }
}

beforeEach(() => {
  Object.assign(server, {
    signedUp: true,
    cancels: 0,
    signupReads: 0,
    hold: null,
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(String(input), 'http://localhost')
      const answers = await Promise.all(
        decodeURIComponent(pathname.slice('/api/trpc/'.length))
          .split(',')
          .map(answer),
      )
      return new Response(JSON.stringify(answers.map(([body]) => body)), {
        status: Math.max(...answers.map(([, status]) => status)),
        headers: { 'content-type': 'application/json' },
      })
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

describe('cancelling a workshop seat in the portal', () => {
  it('keeps the cancel button unavailable until the sign-ups have been read again', async () => {
    let release = () => {}
    server.hold = new Promise<void>((resolve) => (release = resolve))
    render(
      <Providers>
        <WorkshopList
          userWorkOSId="workos-1"
          userEmail="attendee@example.com"
          userName="Attendee One"
        />
      </Providers>,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel Registration' }),
    )

    // The cancel has been answered and the read of the sign-ups is on its way,
    // held: the card still shows the old sign-up.
    await screen.findByText('Successfully cancelled workshop signup')
    await waitFor(() => expect(server.signupReads).toBe(2))
    // Time for a button that is going to come back to come back.
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)))

    const button = screen.getByRole('button', { name: 'Cancelling...' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(server.cancels).toBe(1)

    await act(async () => release())

    // Read again: the workshop is one the attendee has not signed up for.
    expect(
      await screen.findByRole('button', { name: 'Register for Workshop' }),
    ).toBeEnabled()
    expect(server.cancels).toBe(1)
    expect(screen.queryByText('Signup not found')).not.toBeInTheDocument()
  })
})
