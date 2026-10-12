/**
 * @vitest-environment jsdom
 *
 * The numbers on a workshop card on `/admin/workshops`, and the sign-up lists
 * behind them, after an organizer has acted on a sign-up.
 *
 * A card starts from the SERVER render (`initialWorkshops`), which nothing reads
 * again. After "Move to waitlist" (#1331) the card therefore kept its old
 * confirmed count, and showed the moved person in both numbers whenever the
 * waitlist number came from the page's own list. The sign-ups the page reads
 * itself are one page of 100, so they cannot give the counts either.
 *
 * The counts now come from `workshop.admin.getSummary`, which the page reads
 * again after every attempt. Its per-workshop numbers are the workshop's own
 * counts, computed in the query the server render uses. The page is NOT
 * re-rendered on the server (`router.refresh()`): that re-runs everything on
 * the page for three numbers, and a refresh that cannot reach the server
 * becomes a hard navigation.
 *
 * Real here: the page, its modals, the hook, the tRPC and query clients (with
 * the app's 60 s stale time) and the toasts. The server is the `fetch` below.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api, getTRPCClient } from '@/lib/trpc/client'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import type { ProposalWithWorkshopData } from '@/lib/workshop/types'
import { WorkshopsClientPage } from './WorkshopsClientPage'

const router = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

/**
 * The stored state. The counts are the workshop's own and far above what one
 * page of sign-ups holds: 120 confirmed, of whom the page's list has two. A
 * number on the card that follows these cannot have come from that list.
 */
const server = {
  capacity: 125,
  confirmed: 120,
  waitlist: 7,
  signups: [] as Array<{ _id: string; userName: string; status: string }>,
  /** The attendee has cancelled Ada's sign-up: it is gone when the move arrives. */
  attendeeCancelsFirst: false,
  /** While set, the summary waits on it. */
  holdSummary: null as Promise<void> | null,
  summaryReads: 0,
}

/** What the server rendered when the page was loaded. Never read again. */
const SERVER_RENDER = [
  {
    _id: 'ws-1',
    title: 'Kubernetes 101',
    format: 'workshop_120',
    capacity: 125,
    signups: 118,
    waitlistCount: 9,
    available: 7,
    speakers: [],
  },
] as unknown as ProposalWithWorkshopData[]

const row = (signup: (typeof server.signups)[number]) => ({
  ...signup,
  _type: 'workshopSignup',
  userEmail: `${signup._id}@example.com`,
  userWorkOSId: signup._id,
  signedUpAt: '2026-09-01T08:00:00Z',
  _createdAt: '2026-09-01T08:00:00Z',
  workshop: { _ref: 'ws-1', _id: 'ws-1', title: 'Kubernetes 101' },
})

const ok = (data: unknown) => ({ result: { data } })

async function answer(
  procedure: string,
  input: unknown,
): Promise<[unknown, number]> {
  switch (procedure) {
    case 'workshop.admin.getAllSignups':
      return [ok({ success: true, data: server.signups.map(row) }), 200]
    case 'workshop.admin.listSignups': {
      const { status } = input as { status?: string }
      const data = server.signups.filter((s) => s.status === status).map(row)
      return [ok({ success: true, data, count: data.length }), 200]
    }
    case 'workshop.admin.getSummary': {
      server.summaryReads += 1
      if (server.holdSummary) await server.holdSummary
      return [
        ok({
          success: true,
          data: {
            workshops: [
              {
                workshopId: 'ws-1',
                workshopTitle: 'Kubernetes 101',
                capacity: server.capacity,
                totalSignups: server.confirmed + server.waitlist,
                confirmedSignups: server.confirmed,
                waitlistSignups: server.waitlist,
                utilization: (server.confirmed / server.capacity) * 100,
              },
            ],
            totals: {},
          },
        }),
        200,
      ]
    }
    case 'workshop.admin.batchCancelSignups': {
      const [id] = (input as { signupIds: string[] }).signupIds
      if (server.attendeeCancelsFirst) {
        server.signups = server.signups.filter((s) => s._id !== id)
        server.confirmed -= 1
        return [
          {
            error: {
              message: 'One or more signups do not belong to this conference',
              code: -32004,
              data: { code: 'NOT_FOUND', httpStatus: 404 },
            },
          },
          404,
        ]
      }
      server.signups = server.signups.map((s) =>
        s._id === id ? { ...s, status: 'waitlist' } : s,
      )
      server.confirmed -= 1
      server.waitlist += 1
      return [
        ok({
          success: true,
          message: 'unused',
          results: { succeeded: 1, failed: 0, total: 1 },
        }),
        200,
      ]
    }
    case 'workshop.admin.updateCapacity': {
      // Five more seats, and the five who waited longest get them.
      const { capacity } = input as { capacity: number }
      const promoted = Math.min(capacity - server.capacity, server.waitlist)
      server.capacity = capacity
      server.confirmed += promoted
      server.waitlist -= promoted
      return [
        ok({ success: true, data: {}, message: 'unused', promotedCount: 0 }),
        200,
      ]
    }
    default:
      throw new Error(`unexpected procedure ${procedure}`)
  }
}

beforeEach(() => {
  Object.assign(server, {
    capacity: 125,
    confirmed: 120,
    waitlist: 7,
    signups: [
      { _id: 'signup-ada', userName: 'Ada Lovelace', status: 'confirmed' },
      { _id: 'signup-bob', userName: 'Bob Smith', status: 'confirmed' },
    ],
    attendeeCancelsFirst: false,
    holdSummary: null,
    summaryReads: 0,
  })
  router.refresh.mockReset()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(request), 'http://localhost')
      const procedures = decodeURIComponent(
        url.pathname.slice('/api/trpc/'.length),
      ).split(',')
      const inputs = JSON.parse(
        init?.body
          ? String(init.body)
          : (url.searchParams.get('input') ?? '{}'),
      )
      const answers = await Promise.all(
        procedures.map((procedure, i) => answer(procedure, inputs[i])),
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
    () =>
      new QueryClient({
        // As `TRPCProvider` sets it in the app: a list read less than a minute
        // ago is shown again without asking the server.
        defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
      }),
  )
  const [trpcClient] = useState(() => getTRPCClient())
  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>{children}</NotificationProvider>
      </QueryClientProvider>
    </api.Provider>
  )
}

function renderPage() {
  render(
    <Providers>
      <WorkshopsClientPage
        conferenceId="conf-1"
        initialWorkshops={SERVER_RENDER}
        resendDisabledReason={null}
      />
    </Providers>,
  )
}

// A card sits behind an open sign-up list, which hides it from assistive
// technology; `hidden` finds it all the same.
const cardButton = (name: RegExp) =>
  screen.findByRole('button', { name, hidden: true })

const closeTheList = (list: HTMLElement) =>
  fireEvent.click(within(list).getByRole('button', { name: 'Close dialog' }))

/** Open the confirmed list of the workshop and move Ada to the waitlist. */
async function moveAdaToTheWaitlist() {
  fireEvent.click(await cardButton(/^Confirmed\s*120$/))
  const list = await screen.findByRole('dialog', {
    name: 'Kubernetes 101 - Confirmed Signups',
  })
  expect(await within(list).findAllByText('Ada Lovelace')).not.toHaveLength(0)
  // Ada's row, as a card and as a table row; either will do.
  fireEvent.click(
    within(list).getAllByRole('button', { name: 'Move to waitlist' })[0],
  )
  const confirm = within(
    await screen.findByRole('dialog', { name: 'Move to waitlist' }),
  ).getByRole('button', { name: 'Move to waitlist' })
  // The question ignores its confirm button for a moment after it opens.
  await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'))
  fireEvent.click(confirm)
  return list
}

describe('the numbers on a workshop card', () => {
  it('start from the server render and are the summary’s once it is in', async () => {
    let release = () => {}
    server.holdSummary = new Promise<void>((resolve) => (release = resolve))
    renderPage()

    expect(await cardButton(/^Confirmed\s*118$/)).toBeInTheDocument()
    expect(await cardButton(/^Waitlist\s*9$/)).toBeInTheDocument()

    release()

    expect(await cardButton(/^Confirmed\s*120$/)).toBeInTheDocument()
    expect(await cardButton(/^Waitlist\s*7$/)).toBeInTheDocument()
  })

  it('show one fewer confirmed and one more on the waitlist after "Move to waitlist"', async () => {
    renderPage()
    await moveAdaToTheWaitlist()

    await screen.findByText('Moved to waitlist')
    expect(await cardButton(/^Confirmed\s*119$/)).toBeInTheDocument()
    expect(await cardButton(/^Waitlist\s*8$/)).toBeInTheDocument()
    expect(screen.getByText('119/125')).toBeInTheDocument()
    // Read through the summary, not by rendering the page on the server again.
    expect(server.summaryReads).toBe(2)
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it('give the capacity modal the new number of confirmed participants', async () => {
    renderPage()
    closeTheList(await moveAdaToTheWaitlist())
    await cardButton(/^Confirmed\s*119$/)

    fireEvent.click(screen.getByTitle('Edit capacity'))

    expect(
      await screen.findByText('Currently 119 confirmed participants'),
    ).toBeInTheDocument()
  })

  it('are read again after a refused move too: the attendee had cancelled', async () => {
    server.attendeeCancelsFirst = true
    renderPage()
    await moveAdaToTheWaitlist()

    await screen.findByText('Could not move to waitlist')
    // One fewer confirmed (the cancel), nobody new on the waitlist.
    expect(await cardButton(/^Confirmed\s*119$/)).toBeInTheDocument()
    expect(await cardButton(/^Waitlist\s*7$/)).toBeInTheDocument()
    expect(server.summaryReads).toBe(2)
  })

  it('follow a capacity change: the new capacity and the people it seated', async () => {
    renderPage()
    await cardButton(/^Confirmed\s*120$/)
    fireEvent.click(screen.getByTitle('Edit capacity'))
    const modal = await screen.findByRole('dialog', {
      name: /Edit Workshop Capacity/,
    })
    fireEvent.change(within(modal).getByRole('spinbutton'), {
      target: { value: '130' },
    })

    fireEvent.click(
      within(modal).getByRole('button', { name: 'Update Capacity' }),
    )

    // All three from one read: a card with the new count over the old capacity
    // would say 125/125 here.
    expect(await screen.findByText('125/130')).toBeInTheDocument()
    expect(await cardButton(/^Confirmed\s*125$/)).toBeInTheDocument()
    expect(await cardButton(/^Waitlist\s*2$/)).toBeInTheDocument()
  })
})

describe('the sign-up lists after "Move to waitlist"', () => {
  it('show the moved person on the waitlist, also when that list was read a moment ago', async () => {
    renderPage()
    // The waitlist is looked at first, and is empty.
    fireEvent.click(await cardButton(/^Waitlist\s*7$/))
    const before = await screen.findByRole('dialog', {
      name: 'Kubernetes 101 - Waitlist Signups',
    })
    await within(before).findByText(/No waitlist signups/)
    closeTheList(before)

    closeTheList(await moveAdaToTheWaitlist())
    await screen.findByText('Moved to waitlist')

    fireEvent.click(await cardButton(/^Waitlist\s*8$/))
    const waitlist = await screen.findByRole('dialog', {
      name: 'Kubernetes 101 - Waitlist Signups',
    })
    expect(
      await within(waitlist).findAllByText('Ada Lovelace'),
    ).not.toHaveLength(0)
  })
})
