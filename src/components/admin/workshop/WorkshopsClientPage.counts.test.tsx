/**
 * @vitest-environment jsdom
 *
 * The numbers on a workshop card on `/admin/workshops` after an organizer has
 * acted on a sign-up.
 *
 * The card's counts come from the SERVER render (`initialWorkshops`: the
 * workshop's own confirmed and waitlist counts, computed in the query). The
 * sign-ups the page reads itself are one page of 100, so they cannot replace
 * those counts. After "Move to waitlist" (#1331) the card therefore kept its
 * old confirmed count, and showed the moved person in both numbers whenever
 * the waitlist number came from the page's own list. The page now asks the
 * router to render the server data again after every attempt.
 *
 * WHAT IS REAL HERE: the page, its modals, the hook, the tRPC client and the
 * toasts. WHAT IS NOT: `router.refresh()` is a stand-in that hands the page the
 * props a new server render would (the "server" below, read again). So this
 * proves that the page ASKS for the re-read after every attempt, and that the
 * card and the capacity modal show the re-read numbers. It does not prove that
 * Next re-runs the server component, nor that the Sanity read behind it is
 * fresh; see the PR for why both are expected to hold.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { api, getTRPCClient } from '@/lib/trpc/client'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import type { ProposalWithWorkshopData } from '@/lib/workshop/types'
import { WorkshopsClientPage } from './WorkshopsClientPage'

const router = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

/**
 * The stored state. The counts are the workshop's own and far above what one
 * page of sign-ups holds: 120 confirmed, of whom the page's list has two. A
 * number on the card that follows these can only have come from the server.
 */
const server = {
  confirmed: 120,
  waitlist: 7,
  signups: [] as Array<{ _id: string; userName: string; status: string }>,
  /** The attendee has cancelled Ada's sign-up: it is gone when the move arrives. */
  attendeeCancelsFirst: false,
}

const workshopsAsTheServerRendersThem = () =>
  [
    {
      _id: 'ws-1',
      title: 'Kubernetes 101',
      format: 'workshop_120',
      capacity: 125,
      signups: server.confirmed,
      waitlistCount: server.waitlist,
      available: 125 - server.confirmed,
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

function answer(procedure: string, input: unknown): [unknown, number] {
  switch (procedure) {
    case 'workshop.admin.getAllSignups':
      return [ok({ success: true, data: server.signups.map(row) }), 200]
    case 'workshop.admin.listSignups': {
      const { status } = input as { status?: string }
      const data = server.signups.filter((s) => s.status === status).map(row)
      return [ok({ success: true, data, count: data.length }), 200]
    }
    case 'workshop.admin.getSummary':
      return [ok({ success: true, data: { workshops: [], totals: {} } }), 200]
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
    default:
      throw new Error(`unexpected procedure ${procedure}`)
  }
}

/** A new server render: the page is handed what the server holds now. */
let renderServerAgain = () => {}

beforeEach(() => {
  Object.assign(server, {
    confirmed: 120,
    waitlist: 7,
    signups: [
      { _id: 'signup-ada', userName: 'Ada Lovelace', status: 'confirmed' },
      { _id: 'signup-bob', userName: 'Bob Smith', status: 'confirmed' },
    ],
    attendeeCancelsFirst: false,
  })
  router.refresh.mockReset()
  router.refresh.mockImplementation(() => renderServerAgain())
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
      const answers = procedures.map((procedure, i) =>
        answer(procedure, inputs[i]),
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
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>{children}</NotificationProvider>
      </QueryClientProvider>
    </api.Provider>
  )
}

function Page() {
  const [workshops, setWorkshops] = useState(workshopsAsTheServerRendersThem)
  useEffect(() => {
    renderServerAgain = () => setWorkshops(workshopsAsTheServerRendersThem())
    return () => {
      renderServerAgain = () => {}
    }
  }, [])
  return (
    <WorkshopsClientPage
      conferenceId="conf-1"
      initialWorkshops={workshops}
      resendDisabledReason={null}
    />
  )
}

// The card sits behind the open sign-up list, which hides it from assistive
// technology; `hidden` finds it all the same.
const cardButton = (name: RegExp) =>
  screen.findByRole('button', { name, hidden: true })

/** Open the confirmed list of the workshop and move Ada to the waitlist. */
async function moveAdaToTheWaitlist() {
  render(
    <Providers>
      <Page />
    </Providers>,
  )
  fireEvent.click(await cardButton(/^Confirmed\s*120$/))
  expect(await cardButton(/^Waitlist\s*7$/)).toBeInTheDocument()

  const list = await screen.findByRole('dialog', {
    name: 'Kubernetes 101 - Confirmed Signups',
  })
  // Ada's row, as a card and as a table row; either will do.
  const [move] = await within(list).findAllByRole('button', {
    name: 'Move to waitlist',
  })
  expect(await within(list).findAllByText('Ada Lovelace')).not.toHaveLength(0)
  fireEvent.click(move)
  fireEvent.click(
    within(
      await screen.findByRole('dialog', { name: 'Move to waitlist' }),
    ).getByRole('button', { name: 'Move to waitlist' }),
  )
}

describe('the workshop card after "Move to waitlist"', () => {
  it('shows one fewer confirmed and one more on the waitlist, from the server', async () => {
    await moveAdaToTheWaitlist()

    await screen.findByText('Moved to waitlist')
    expect(await cardButton(/^Confirmed\s*119$/)).toBeInTheDocument()
    expect(await cardButton(/^Waitlist\s*8$/)).toBeInTheDocument()
    expect(screen.getByText('119/125')).toBeInTheDocument()
    expect(router.refresh).toHaveBeenCalledTimes(1)
  })

  it('gives the capacity modal the new number of confirmed participants', async () => {
    await moveAdaToTheWaitlist()
    await cardButton(/^Confirmed\s*119$/)

    fireEvent.click(screen.getByTitle('Edit capacity'))

    expect(
      await screen.findByText('Currently 119 confirmed participants'),
    ).toBeInTheDocument()
  })

  it('reads the server again after a refused move too: the attendee had cancelled', async () => {
    server.attendeeCancelsFirst = true
    await moveAdaToTheWaitlist()

    await screen.findByText('Could not move to waitlist')
    expect(await cardButton(/^Confirmed\s*119$/)).toBeInTheDocument()
    expect(await cardButton(/^Waitlist\s*7$/)).toBeInTheDocument()
    expect(router.refresh).toHaveBeenCalledTimes(1)
  })
})
