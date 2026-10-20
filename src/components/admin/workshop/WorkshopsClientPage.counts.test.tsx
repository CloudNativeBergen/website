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
import { TAP_GUARD_MS } from '@/hooks/useOpenedLongEnough'
import { WorkshopsClientPage } from './WorkshopsClientPage'
import { WorkshopTicketsSection } from './tickets/WorkshopTicketsSection'
import { buildWorkshopTicketList } from '@/lib/workshop/ticket-list'

const router = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  // The page reads what its "Early sign-ups" list is narrowed to (#1348).
  useSearchParams: () => new URLSearchParams(),
}))

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
  holderReads: 0,
  /** The ticket provider cannot be read (#1333). */
  ticketsDown: false,
  /** The ticket-holder read fails outright (the sign-ups could not be read). */
  holdersFail: false,
  /** While set, the ticket-holder read waits on it: a slow provider. */
  holdHolders: null as Promise<void> | null,
  /** Sign-ups whose owner holds no workshop ticket: the flagged list. */
  flaggedIds: [] as string[],
  /** Holders with no sign-up. A test changes it to tell two reads apart. */
  notSignedUp: 3,
  /** The conference the request's domain resolves to, as the server says. */
  conferenceId: 'conf-1',
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
    case 'workshop.admin.listSignups': {
      const { status } = input as { status?: string }
      const data = server.signups.filter((s) => s.status === status).map(row)
      return [ok({ success: true, data, count: data.length }), 200]
    }
    // The "Early sign-ups" list (#1348): this conference has none.
    // The bulk early-access send (#1347): not what this file is about.
    case 'workshop.admin.earlyAccessBulkPreview':
      return [ok({ count: 0, refusal: null }), 200]
    case 'workshop.admin.listEarlySignups':
      return [ok({ signups: [], sponsors: [] }), 200]
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
    // The ticket holders (#1333): everyone listed holds a workshop ticket,
    // and the numbers follow the stored sign-ups.
    case 'workshop.admin.ticketHolders': {
      server.holderReads += 1
      // The answer is what was stored when the read began; a slow provider
      // delivers it late, not newer.
      const count = (status: string) =>
        server.signups.filter((s) => s.status === status).length
      const stats = {
        conferenceId: server.conferenceId,
        available: true,
        configured: true,
        holders: server.signups.length + 3,
        confirmed: count('confirmed'),
        waitlistOnly: count('waitlist'),
        notSignedUp: server.notSignedUp,
        flagged: server.signups
          .filter((s) => server.flaggedIds.includes(s._id))
          .map((s) => ({
            email: `${s._id}@example.com`,
            name: s.userName,
            signups: [
              {
                _id: s._id,
                userEmail: `${s._id}@example.com`,
                userName: s.userName,
                status: s.status,
                workshop: { _id: 'ws-1', title: 'Kubernetes 101' },
              },
            ],
          })),
        lockedOut: [],
      }
      if (server.holdHolders) await server.holdHolders
      if (server.ticketsDown) {
        return [
          ok({ conferenceId: server.conferenceId, available: false }),
          200,
        ]
      }
      if (server.holdersFail) {
        return [
          {
            error: {
              message: 'Failed to read the workshop ticket holders',
              code: -32603,
              data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
            },
          },
          500,
        ]
      }
      return [ok(stats), 200]
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
    holderReads: 0,
    ticketsDown: false,
    holdersFail: false,
    holdHolders: null,
    flaggedIds: [],
    notSignedUp: 3,
    conferenceId: 'conf-1',
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
      // A batch answers with a list; a call sent on its own (the ticket
      // holders skip the batch) with its one answer.
      const batched = url.searchParams.has('batch')
      const bodies = answers.map(([body]) => body)
      return new Response(JSON.stringify(batched ? bodies : bodies[0]), {
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
        reminderDisabledReason={null}
        lastReminder={null}
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

/**
 * The page is the only way the registration card gets its times (#1345): a
 * time the page does not hand on reads "Not set" on the card, whatever is
 * stored.
 */
describe('the registration card on the page', () => {
  it('shows the three registration times the page was given', async () => {
    render(
      <Providers>
        <WorkshopsClientPage
          conferenceId="conf-1"
          initialWorkshops={SERVER_RENDER}
          reminderDisabledReason={null}
          lastReminder={null}
          workshopRegistrationSponsorStart="2026-06-01T06:00:00.000Z"
          workshopRegistrationStart="2026-06-15T06:30:00.000Z"
          workshopRegistrationEnd="2026-07-01T07:00:00.000Z"
        />
      </Providers>,
    )

    const row = (name: string) =>
      screen.getByText(name).nextElementSibling?.textContent
    expect({
      sponsorStart: row('Sponsor early access opens'),
      start: row('Registration opens'),
      end: row('Registration closes'),
    }).toEqual({
      sponsorStart: '1. juni 2026 kl. 08:00',
      start: '15. juni 2026 kl. 08:30',
      end: '1. juli 2026 kl. 09:00',
    })
    // The page's own reads have settled before the test ends.
    await cardButton(/^Confirmed\s*120$/)
  })
})

describe('the ticket holders (#1333)', () => {
  // Behind an open list, like the cards: `hidden` finds it all the same.
  const panel = () =>
    screen.findByRole('region', { name: 'Ticket holders', hidden: true })
  const tile = async (label: string) =>
    within(await panel()).findByText(label, { selector: 'span' })

  it('follow an action on a sign-up: read again after "Move to waitlist"', async () => {
    renderPage()
    expect((await tile('Not signed up')).nextElementSibling).toHaveTextContent(
      '3',
    )
    // Another holder turns up before the re-read: only a new read shows it.
    server.notSignedUp = 4
    await moveAdaToTheWaitlist()
    await screen.findByText('Moved to waitlist')

    await waitFor(async () =>
      expect(
        (await tile('Not signed up')).nextElementSibling,
      ).toHaveTextContent('4'),
    )
    expect(server.holderReads).toBe(2)
  })

  // #1452: the day-to-day sections first, setup last. A ticket type that
  // needs a decision is named at the top, in "Needs attention", above the
  // totals that leave its holders out (spec §3 of #1333).
  it('come after the workshops and before the settings', async () => {
    render(
      <Providers>
        <WorkshopsClientPage
          conferenceId="conf-1"
          initialWorkshops={SERVER_RENDER}
          reminderDisabledReason={null}
          lastReminder={null}
          ticketsSection={<section aria-label="Workshop tickets" />}
        />
      </Providers>,
    )
    const order = [
      screen.getByRole('region', { name: 'Workshops' }),
      await panel(),
      screen.getByRole('region', { name: 'Sponsor early access' }),
      screen.getByRole('region', { name: 'Workshop tickets' }),
    ]
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
  })

  // An action while the FIRST read is still on its way: that read began
  // before the action, so its answer is old. It must not be taken as the
  // re-read the action asked for (TanStack reuses a fetch in flight when a
  // query has no data yet).
  it('are read again after an action taken while the first read was on its way', async () => {
    let providerAnswers!: () => void
    server.holdHolders = new Promise((resolve) => {
      providerAnswers = resolve
    })
    renderPage()
    // The first read has taken its answer (3) and waits on the provider.
    await waitFor(() => expect(server.holderReads).toBe(1))
    server.notSignedUp = 4
    await moveAdaToTheWaitlist()
    await screen.findByText('Moved to waitlist')
    providerAnswers()

    await waitFor(async () =>
      expect(
        (await tile('Not signed up')).nextElementSibling,
      ).toHaveTextContent('4'),
    )
    expect(server.holderReads).toBe(2)
  })

  // The flagged list still shows a sign-up until the re-read after acting on
  // it lands; acting on it again meanwhile would be refused or repeat itself.
  it('offer no flagged action until the re-read after one is in', async () => {
    server.flaggedIds = ['signup-bob']
    renderPage()
    fireEvent.click(
      await within(await panel()).findByRole('button', { name: 'Flagged, 1' }),
    )
    const list = await screen.findByRole('dialog', { name: 'Flagged sign-ups' })
    const move = () =>
      within(within(list).getByRole('table')).queryByRole('button', {
        name: 'Move to waitlist',
      })

    let providerAnswers!: () => void
    server.holdHolders = new Promise((resolve) => {
      providerAnswers = resolve
    })
    fireEvent.click(move()!)
    const question = await screen.findByRole('dialog', {
      name: 'Move to waitlist',
    })
    // The question takes no confirm for a moment after it opens.
    await new Promise((resolve) => setTimeout(resolve, TAP_GUARD_MS))
    fireEvent.click(
      within(question).getByRole('button', { name: 'Move to waitlist' }),
    )
    await screen.findByText('Moved to waitlist')

    // Moved, and the re-read is on its way: the row still says confirmed,
    // and offers nothing.
    // (The server counts the read before React has rendered it fetching.)
    await waitFor(() => expect(server.holderReads).toBe(2))
    await waitFor(() => expect(move()).toBeDisabled())
    expect(server.holderReads).toBe(2)

    providerAnswers()
    await waitFor(() => expect(move()).toBeNull())
  })

  // TENANCY: the domain now resolves to another conference and the page is
  // rendered for it in the same client. The first conference's numbers (and
  // flagged names) are not shown from the cache; they are read again.
  it('are read again, and the old ones never shown, when the conference changes', async () => {
    const page = (conferenceId: string) => (
      <Providers>
        <WorkshopsClientPage
          conferenceId={conferenceId}
          initialWorkshops={SERVER_RENDER}
          reminderDisabledReason={null}
          lastReminder={null}
        />
      </Providers>
    )
    const { rerender } = render(page('conf-1'))
    expect((await tile('Holders')).nextElementSibling).toHaveTextContent('5')

    server.conferenceId = 'conf-2'
    server.signups = [server.signups[0]]
    rerender(page('conf-2'))

    expect(screen.queryByText('5', { selector: 'span' })).toBeNull()
    await waitFor(async () =>
      expect((await tile('Holders')).nextElementSibling).toHaveTextContent('4'),
    )
    expect(server.holderReads).toBe(2)
  })

  // The page is left and opened again within the cache's 60 seconds, and
  // the domain now resolves to another conference: the cached answer is the
  // other conference's. It is read again on the way in, not hidden for ever.
  it('are read again when the page is opened again for another conference', async () => {
    const page = (conferenceId: string) => (
      <WorkshopsClientPage
        conferenceId={conferenceId}
        initialWorkshops={SERVER_RENDER}
        reminderDisabledReason={null}
        lastReminder={null}
      />
    )
    // One client for both visits, as in the app.
    const { rerender } = render(<Providers>{page('conf-1')}</Providers>)
    expect((await tile('Holders')).nextElementSibling).toHaveTextContent('5')
    rerender(<Providers>{null}</Providers>)

    server.conferenceId = 'conf-2'
    server.signups = [server.signups[0]]
    rerender(<Providers>{page('conf-2')}</Providers>)

    await waitFor(async () =>
      expect((await tile('Holders')).nextElementSibling).toHaveTextContent('4'),
    )
    expect(server.holderReads).toBe(2)
  })

  // The page was rendered for one conference and the server now answers for
  // another (the domain moved under it): the panel says the numbers are
  // unavailable, it does not load for ever.
  it('say unavailable when the server keeps answering for another conference', async () => {
    server.conferenceId = 'conf-2'
    renderPage()
    const region = await panel()
    await within(region).findByText(/^Unavailable:/)
    expect(region.textContent).not.toMatch(/\d/)
  })

  it('wait for nothing else: a slow ticket read holds back no other number', async () => {
    let providerAnswers!: () => void
    server.holdHolders = new Promise((resolve) => {
      providerAnswers = resolve
    })
    renderPage()

    // The summary's numbers are in while the ticket holders are not.
    expect(await cardButton(/^Confirmed\s*120$/)).toBeInTheDocument()
    expect(
      within(await panel()).getByRole('status', { hidden: true }),
    ).toHaveTextContent('Reading the ticket holders')

    providerAnswers()
    expect((await tile('Holders')).nextElementSibling).toHaveTextContent('5')
  })

  it.each([
    ['the tickets cannot be read', 'ticketsDown'],
    ['the read fails outright', 'holdersFail'],
  ] as const)(
    'say unavailable when %s, and the sign-up totals still render',
    async (_, flag) => {
      server[flag] = true
      renderPage()

      const region = await panel()
      await within(region).findByText(/^Unavailable:/)
      expect(region.textContent).not.toMatch(/\d/)
      // The sign-up totals from the summary are on the page all the same.
      expect(await screen.findByText('Total sign-ups')).toBeInTheDocument()
    },
  )
})

/**
 * "Needs attention" (#1452): at the top of the page, only when something
 * further down needs the organizer, with a link to where it is settled.
 */
describe('Needs attention (#1452)', () => {
  const attention = () =>
    screen.queryByRole('region', { name: 'Needs attention' })

  function renderWithTickets(
    list: ReturnType<typeof buildWorkshopTicketList> | null,
  ) {
    render(
      <Providers>
        <WorkshopsClientPage
          conferenceId="conf-1"
          initialWorkshops={SERVER_RENDER}
          reminderDisabledReason={null}
          lastReminder={null}
          ticketsSection={
            <WorkshopTicketsSection list={list} providerLabel="Checkin.no" />
          }
        />
      </Providers>,
    )
  }

  it('names a ticket type that needs a decision, and links to its card', async () => {
    // Configured, with one type nobody has answered for.
    renderWithTickets(
      buildWorkshopTicketList(
        ['Early Bird', 'Speaker'],
        [{ typeName: 'Early Bird', grantsWorkshop: true }],
      ),
    )
    const region = await screen.findByRole('region', {
      name: 'Needs attention',
    })
    expect(region).toHaveTextContent(
      'Workshop tickets need a decision: a ticket type is not set, or an answer names a type that no longer exists.',
    )
    const link = within(region).getByRole('link', {
      name: 'Review workshop tickets',
    })
    const target = document.getElementById(link.getAttribute('href')!.slice(1))
    expect(target).toBe(
      screen.getByRole('region', { name: /^Workshop tickets/ }),
    )
    // The page's own reads have settled before the test ends.
    await cardButton(/^Confirmed\s*120$/)
  })

  it('says when the workshop tickets could not be read', async () => {
    renderWithTickets(null)
    const region = await screen.findByRole('region', {
      name: 'Needs attention',
    })
    expect(region).toHaveTextContent('The workshop tickets could not be read.')
    await cardButton(/^Confirmed\s*120$/)
  })

  // The address is at the anchor already (arrived by a link to it, or the
  // link was followed before): following it again changes nothing in the
  // address, and the card the organizer closed is opened all the same.
  it('opens the tickets card the organizer closed, from the address it is already at', async () => {
    renderWithTickets(
      buildWorkshopTicketList(
        ['Early Bird', 'Speaker'],
        [{ typeName: 'Early Bird', grantsWorkshop: true }],
      ),
    )
    // The address moves to the anchor, and the change has been handled.
    const moved = new Promise((resolve) =>
      window.addEventListener('hashchange', resolve, { once: true }),
    )
    window.location.hash = 'workshop-tickets'
    await moved
    const toggle = screen.getByRole('button', { name: /^Workshop tickets/ })
    fireEvent.click(toggle)
    // Nothing reopens it by itself.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    const region = await screen.findByRole('region', {
      name: 'Needs attention',
    })
    fireEvent.click(
      within(region).getByRole('link', { name: 'Review workshop tickets' }),
    )
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    window.location.hash = ''
    await cardButton(/^Confirmed\s*120$/)
  })

  it('names the people flagged, and links to the ticket holders', async () => {
    server.flaggedIds = ['signup-ada', 'signup-bob']
    renderWithTickets(
      buildWorkshopTicketList(
        ['Early Bird'],
        [{ typeName: 'Early Bird', grantsWorkshop: true }],
      ),
    )
    const region = await screen.findByRole('region', {
      name: 'Needs attention',
    })
    expect(region).toHaveTextContent(
      '2 people have signed up without a workshop ticket.',
    )
    expect(region).not.toHaveTextContent('Workshop tickets')
    const link = within(region).getByRole('link', {
      name: 'Review ticket holders',
    })
    expect(document.getElementById(link.getAttribute('href')!.slice(1))).toBe(
      screen.getByRole('region', { name: 'Ticket holders' }),
    )
  })

  it('is not on the page when nothing needs the organizer', async () => {
    renderWithTickets(
      buildWorkshopTicketList(
        ['Early Bird'],
        [{ typeName: 'Early Bird', grantsWorkshop: true }],
      ),
    )
    // The ticket holders have been read, and flag nobody.
    const holders = await screen.findByRole('region', {
      name: 'Ticket holders',
    })
    await within(holders).findByText('Flagged', { selector: 'span' })
    expect(attention()).toBeNull()
  })
})
