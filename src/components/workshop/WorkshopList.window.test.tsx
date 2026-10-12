/**
 * @vitest-environment jsdom
 *
 * THE REGISTRATION WINDOW in the portal's list (#1345, spec
 * `docs/WORKSHOP_SPONSOR_EARLY_ACCESS_SPEC.md` §3): the list shows the
 * workshops a person can still sign up for only while sign-up is open for
 * them, and it always shows the ones they are in.
 *
 * Three workshops: one the attendee is signed up for, one with seats and one
 * that is full. What the list chose is read as a value: the headings of the
 * sections it rendered. The clock is pinned and every time is a literal around
 * it.
 *
 * Against the real tRPC client and query client, with only `fetch` supplied.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api, getTRPCClient } from '@/lib/trpc/client'
import WorkshopList from './WorkshopList'

const workshop = (_id: string, title: string, available: number) => ({
  _id,
  title,
  format: 'workshop_120',
  capacity: 30,
  signups: 30 - available,
  available,
  waitlistCount: 0,
  date: '2026-09-10',
  // Three different slots, so no card is about a time conflict.
  startTime: { 'ws-mine': '09:00', 'ws-seats': '12:00', 'ws-full': '15:00' }[
    _id
  ],
  endTime: { 'ws-mine': '11:00', 'ws-seats': '14:00', 'ws-full': '17:00' }[_id],
  room: 'Room A',
  description: 'Hands-on.',
  speakers: [],
  topics: [],
})

const WORKSHOPS = [
  workshop('ws-mine', 'Kubernetes 101', 5),
  workshop('ws-seats', 'Observability', 18),
  workshop('ws-full', 'Service mesh', 0),
]

const SIGNUP = {
  _id: 'signup-1',
  _type: 'workshopSignup',
  status: 'confirmed',
  workshop: { _type: 'reference', _ref: 'ws-mine' },
}

const ok = (data: unknown) => ({ result: { data } })

function answer(procedure: string): unknown {
  switch (procedure) {
    case 'workshop.list':
      return ok({ success: true, data: WORKSHOPS, count: WORKSHOPS.length })
    case 'workshop.getMySignups':
      return ok({ success: true, data: [SIGNUP], count: 1 })
    case 'workshop.announcementsByWorkshop':
      return ok({ success: true, data: {} })
    default:
      throw new Error(`unexpected procedure ${procedure}`)
  }
}

/** The pinned clock: 14:00 in Oslo on Wednesday 10 June 2026. */
const NOW = '2026-06-10T12:00:00.000Z'
const A_SECOND_BEFORE = '2026-06-10T11:59:59.000Z'
const A_SECOND_AFTER = '2026-06-10T12:00:01.000Z'
const LONG_BEFORE = '2026-05-01T07:00:00.000Z'
const LONG_AFTER = '2026-07-01T07:00:00.000Z'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(String(input), 'http://localhost')
      const answers = decodeURIComponent(pathname.slice('/api/trpc/'.length))
        .split(',')
        .map(answer)
      return new Response(JSON.stringify(answers), {
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
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

/** The sections the list shows for these registration times, once it has drawn the attendee's own. */
async function sectionsWith(times: {
  workshopRegistrationStart?: string
  workshopRegistrationEnd?: string
}) {
  render(
    <Providers>
      <WorkshopList
        userWorkOSId="workos-1"
        userEmail="attendee@example.com"
        userName="Attendee One"
        {...times}
      />
    </Providers>,
  )
  // Both reads have arrived: the attendee's sign-up is on its own card.
  await screen.findByRole('heading', { level: 2, name: 'Your Workshops' })
  return screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent)
}

const OPEN = ['Your Workshops', 'Available Workshops', 'Full Workshops']
const NOT_FOR_SIGN_UP = ['Your Workshops']

describe('the workshop list and the registration window', () => {
  it('with neither time set, offers every workshop', async () => {
    expect(await sectionsWith({})).toEqual(OPEN)
  })

  it('with no start set, is open from the beginning: offers every workshop long before the end', async () => {
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
    expect(await sectionsWith({ workshopRegistrationEnd: LONG_AFTER })).toEqual(
      OPEN,
    )
  })

  it('with no end set, never closes: offers every workshop long after the start', async () => {
    vi.setSystemTime(new Date('2099-01-01T00:00:00.000Z'))
    expect(
      await sectionsWith({ workshopRegistrationStart: LONG_BEFORE }),
    ).toEqual(OPEN)
  })

  it('at the very instant of the start and of the end, offers every workshop', async () => {
    expect(
      await sectionsWith({
        workshopRegistrationStart: NOW,
        workshopRegistrationEnd: NOW,
      }),
    ).toEqual(OPEN)
  })

  it('a second before the start, shows only the attendee’s own', async () => {
    expect(
      await sectionsWith({
        workshopRegistrationStart: A_SECOND_AFTER,
        workshopRegistrationEnd: LONG_AFTER,
      }),
    ).toEqual(NOT_FOR_SIGN_UP)
  })

  it('a second after the end, shows only the attendee’s own', async () => {
    expect(
      await sectionsWith({
        workshopRegistrationStart: LONG_BEFORE,
        workshopRegistrationEnd: A_SECOND_BEFORE,
      }),
    ).toEqual(NOT_FOR_SIGN_UP)
  })
})
