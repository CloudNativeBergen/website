/**
 * @vitest-environment jsdom
 *
 * An attendee's cancel deletes the sign-up (#1331), so a SECOND cancel of the
 * same sign-up is refused with "Signup not found". The card keeps showing the
 * old sign-up until the attendee's sign-ups have been read again, and for as
 * long as it does its cancel button must not be available: a second click
 * would put an error over a cancel that worked. (Before #1331 the second
 * cancel set `waitlist` again and nobody noticed.)
 *
 * The rule under test is about what is ON THE PAGE, not about time: a sign-up
 * whose cancel the server has answered cannot be cancelled again while it is
 * still shown. Nothing here waits on a clock.
 *
 * Against the real tRPC client and query client, with only `fetch` supplied.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  /** A read of the attendee's sign-ups AFTER the cancel fails: the old list stays. */
  failRereads: false,
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
      if (!server.signedUp && server.failRereads) {
        return [
          {
            error: {
              message: 'fetch failed',
              code: -32603,
              data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
            },
          },
          500,
        ]
      }
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
    failRereads: false,
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

const CANCEL = /^(Cancel Registration|Cancelling\.\.\.)$/

function renderPortal() {
  render(
    <Providers>
      <WorkshopList
        userWorkOSId="workos-1"
        userEmail="attendee@example.com"
        userName="Attendee One"
      />
    </Providers>,
  )
}

/**
 * From now on, at every change to the page: if a cancel button is there and
 * enabled, press it. An impatient attendee, at the first instant the page lets
 * them. Returns how often that happened.
 */
function pressCancelWheneverItIsEnabled() {
  let pressed = 0
  const observer = new MutationObserver(() => {
    for (const button of screen.queryAllByRole('button', { name: CANCEL })) {
      if (!(button as HTMLButtonElement).disabled) {
        pressed += 1
        fireEvent.click(button)
      }
    }
  })
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  })
  return () => {
    observer.disconnect()
    return pressed
  }
}

describe('cancelling a workshop seat in the portal', () => {
  it('cannot be cancelled again while the cancelled sign-up is still on the page', async () => {
    // The read after the cancel fails, so the page keeps the old list for as
    // long as the test likes: the cancelled sign-up stays on its card.
    server.failRereads = true
    renderPortal()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel Registration' }),
    )

    // The failed read has been drawn, which is later than the cancel's answer:
    // the card is no longer busy with the cancel itself.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not load your workshop registrations/i,
    )
    expect(server.cancels).toBe(1)
    const button = screen.getByRole('button', { name: 'Cancel Registration' })
    expect(button).toBeDisabled()

    fireEvent.click(button)

    expect(server.cancels).toBe(1)
    expect(screen.queryByText('Signup not found')).not.toBeInTheDocument()
  })

  it('never offers a second cancel between the answer and the redrawn list', async () => {
    // The read after the cancel takes its time, as it does over a network. The
    // cancel itself has been answered: the banner says so.
    let release = () => {}
    server.hold = new Promise<void>((resolve) => (release = resolve))
    renderPortal()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel Registration' }),
    )
    await screen.findByText('Successfully cancelled workshop signup')
    const stop = pressCancelWheneverItIsEnabled()

    release()

    // Read again and drawn: the workshop is one the attendee has not signed up
    // for.
    expect(
      await screen.findByRole('button', { name: 'Register for Workshop' }),
    ).toBeEnabled()
    expect(stop()).toBe(0)
    expect(server.cancels).toBe(1)
    expect(screen.queryByText('Signup not found')).not.toBeInTheDocument()
  })
})
