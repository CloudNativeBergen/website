/**
 * @vitest-environment jsdom
 *
 * EARLY ACCESS in the portal's list (#1346, spec
 * `docs/WORKSHOP_SPONSOR_EARLY_ACCESS_SPEC.md` §7): a person whose early
 * access the page resolved can sign up from the sponsor start time, and join
 * the waitlist of a full workshop, while everyone else still waits for the
 * official opening.
 *
 * The harness of `WorkshopList.window.test.tsx`: the real tRPC client and
 * query client, with only `fetch` supplied. Three workshops: one the attendee
 * is signed up for, one with seats and one that is full. The clock is pinned.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
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
    case 'workshop.signup':
      return signupAnswer
    default:
      throw new Error(`unexpected procedure ${procedure}`)
  }
}

/** What the server answers a sign-up with. */
let signupAnswer: unknown
const refusal = (code: string, message: string) => ({
  error: { message, code: -32000, data: { code } },
})

/** The pinned clock: 14:00 in Oslo on Wednesday 10 June 2026. */
const NOW = '2026-06-10T12:00:00.000Z'
/** Monday 8 June: two days ago. */
const SPONSOR_START = '2026-06-08T07:00:00.000Z'
/** Friday 12 June: two days ahead. */
const SPONSOR_START_AHEAD = '2026-06-12T07:00:00.000Z'
/** Monday 15 June. */
const OFFICIAL_OPENING = '2026-06-14T22:30:00.000Z'
const END = '2026-07-01T07:00:00.000Z'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(String(input), 'http://localhost')
      const answers = decodeURIComponent(pathname.slice('/api/trpc/'.length))
        .split(',')
        .map(answer)
      const refused = answers.some(
        (each) => typeof each === 'object' && each !== null && 'error' in each,
      )
      return new Response(JSON.stringify(answers), {
        status: refused ? 412 : 200,
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

/** The sections the list shows, once it has drawn the attendee's own. */
async function sectionsFor(props: {
  earlyAccess?: boolean
  workshopRegistrationSponsorStart?: string
  onEarlyAccessRefused?: () => void
}) {
  render(
    <Providers>
      <WorkshopList
        userWorkOSId="workos-1"
        userEmail="attendee@example.com"
        userName="Attendee One"
        workshopRegistrationStart={OFFICIAL_OPENING}
        workshopRegistrationEnd={END}
        {...props}
      />
    </Providers>,
  )
  await screen.findByRole('heading', { level: 2, name: 'Your Workshops' })
  return screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent)
}

const OPEN = ['Your Workshops', 'Available Workshops', 'Full Workshops']
const NOT_FOR_SIGN_UP = ['Your Workshops']

describe('the workshop list for a person with early access', () => {
  it('inside the early-access window, offers every workshop', async () => {
    expect(
      await sectionsFor({
        earlyAccess: true,
        workshopRegistrationSponsorStart: SPONSOR_START,
      }),
    ).toEqual(OPEN)
  })

  it('inside the window, a workshop with seats can be signed up for and a full one joined on its waitlist', async () => {
    await sectionsFor({
      earlyAccess: true,
      workshopRegistrationSponsorStart: SPONSOR_START,
    })

    // Nothing here is the attendee's own card: these are the two offers.
    expect(
      screen.getByRole('button', { name: 'Register for Workshop' }),
    ).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Join Waitlist' })).toBeEnabled()
  })

  it('before the sponsor start time, shows only the attendee’s own', async () => {
    expect(
      await sectionsFor({
        earlyAccess: true,
        workshopRegistrationSponsorStart: SPONSOR_START_AHEAD,
      }),
    ).toEqual(NOT_FOR_SIGN_UP)
  })

  it('at the very instant of the sponsor start time, offers every workshop', async () => {
    expect(
      await sectionsFor({
        earlyAccess: true,
        workshopRegistrationSponsorStart: NOW,
      }),
    ).toEqual(OPEN)
  })

  it('after the end, shows only the attendee’s own', async () => {
    vi.setSystemTime(new Date('2026-07-02T07:00:00.000Z'))
    expect(
      await sectionsFor({
        earlyAccess: true,
        workshopRegistrationSponsorStart: SPONSOR_START,
      }),
    ).toEqual(NOT_FOR_SIGN_UP)
  })
})

describe('the workshop list for a person without early access', () => {
  it('inside the window, shows only the attendee’s own, whatever times it was handed', async () => {
    expect(
      await sectionsFor({
        earlyAccess: false,
        workshopRegistrationSponsorStart: SPONSOR_START,
      }),
    ).toEqual(NOT_FOR_SIGN_UP)
  })

  it('from the official opening, offers every workshop', async () => {
    vi.setSystemTime(new Date(OFFICIAL_OPENING))
    expect(await sectionsFor({})).toEqual(OPEN)
  })
})

describe('a sign-up the server refuses while the list shows early access', () => {
  const OPENS_OFFICIALLY =
    'Workshop registration opens on Monday, June 15, 2026 at 12:30 AM'

  /** Press "Register for Workshop" and confirm, and wait for the refusal. */
  async function signUpAndBeRefused(message: string) {
    fireEvent.click(
      screen.getByRole('button', { name: 'Register for Workshop' }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: /confirm registration/i }),
    )
    await screen.findAllByText(message)
  }

  it('asks the page to render again when the refusal is for the window: the link was revoked', async () => {
    const onEarlyAccessRefused = vi.fn()
    signupAnswer = refusal('PRECONDITION_FAILED', OPENS_OFFICIALLY)
    await sectionsFor({
      earlyAccess: true,
      workshopRegistrationSponsorStart: SPONSOR_START,
      onEarlyAccessRefused,
    })

    await signUpAndBeRefused(OPENS_OFFICIALLY)

    await waitFor(() => expect(onEarlyAccessRefused).toHaveBeenCalledTimes(1))
  })

  it('does not for any other refusal', async () => {
    const onEarlyAccessRefused = vi.fn()
    signupAnswer = refusal(
      'CONFLICT',
      'You are already signed up for this workshop',
    )
    await sectionsFor({
      earlyAccess: true,
      workshopRegistrationSponsorStart: SPONSOR_START,
      onEarlyAccessRefused,
    })

    await signUpAndBeRefused('You are already signed up for this workshop')

    expect(onEarlyAccessRefused).not.toHaveBeenCalled()
  })

  it('does not once sign-up is open for everyone: the list was not showing early access', async () => {
    const onEarlyAccessRefused = vi.fn()
    // The page was rendered with early access; the official opening has
    // since passed, and sign-up then closes under the person's hands.
    vi.setSystemTime(new Date(OFFICIAL_OPENING))
    signupAnswer = refusal(
      'PRECONDITION_FAILED',
      'Workshop registration has closed',
    )
    await sectionsFor({
      earlyAccess: true,
      workshopRegistrationSponsorStart: SPONSOR_START,
      onEarlyAccessRefused,
    })

    await signUpAndBeRefused('Workshop registration has closed')

    expect(onEarlyAccessRefused).not.toHaveBeenCalled()
  })

  it('does not for a person who was not shown early access', async () => {
    const onEarlyAccessRefused = vi.fn()
    vi.setSystemTime(new Date(OFFICIAL_OPENING))
    signupAnswer = refusal(
      'PRECONDITION_FAILED',
      'Workshop registration has closed',
    )
    await sectionsFor({ onEarlyAccessRefused })

    await signUpAndBeRefused('Workshop registration has closed')

    expect(onEarlyAccessRefused).not.toHaveBeenCalled()
  })
})
