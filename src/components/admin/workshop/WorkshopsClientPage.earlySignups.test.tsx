/**
 * @vitest-environment jsdom
 *
 * EARLY SIGN-UPS ON `/admin/workshops` (#1348, spec §9), as the page wires
 * them: the "Early sign-ups" list and its narrowing, and the badge in a
 * workshop's sign-up dialog from both reads that feed it.
 *
 * THE NARROWING IS THE SERVER'S. The page's general read of sign-ups holds the
 * first hundred only, so the page never filters: it asks
 * `workshop.admin.listEarlySignups` again with the sponsor in the input, and
 * shows what comes back. Here the server's narrowed answer holds a person NO
 * other answer holds, so a row that shows them cannot have been filtered out
 * of anything the browser had.
 *
 * THE ADDRESS IS THE ONE SOURCE OF WHAT THE LIST IS NARROWED TO. The page
 * keeps no state of its own for it: with Cache Components, Next keeps a
 * visited route mounted and hidden, so a page that seeded state once from the
 * address would show its OLD narrowing when the link on a sponsor's record
 * brings the organizer back with another sponsor.
 *
 * Real here: the page, the list, the dialog, the tRPC and query clients (with
 * the app's 60 s stale time). The server is the `fetch` below, which records
 * the input of every read of the list.
 *
 * MODELLED: `useSearchParams`, as a hook that follows the address. That
 * Next's own does so, for a navigation into a route it kept mounted and for
 * `history.replaceState`, is in its docs and was run on a production build
 * (see the PR); it is not something this file can show.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Activity, useEffect, useState, type ReactNode } from 'react'
import { api, getTRPCClient } from '@/lib/trpc/client'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import type { ProposalWithWorkshopData } from '@/lib/workshop/types'
import { WorkshopsClientPage } from './WorkshopsClientPage'

const router = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  /** Called whenever the address changes: the page's hook reads it again. */
  addressChanged: new Set<() => void>(),
}))
vi.mock('next/navigation', async () => {
  const { useMemo, useSyncExternalStore } = await import('react')
  const subscribe = (listener: () => void) => {
    router.addressChanged.add(listener)
    return () => void router.addressChanged.delete(listener)
  }
  return {
    useRouter: () => router,
    useSearchParams: () => {
      const search = useSyncExternalStore(
        subscribe,
        () => window.location.search,
      )
      return useMemo(() => new URLSearchParams(search), [search])
    },
  }
})

/**
 * The address changes under the page, and whoever reads it is told: what a
 * navigation does, and what Next's patched `history.replaceState` does.
 */
const realReplaceState = window.history.replaceState.bind(window.history)
const realPushState = window.history.pushState.bind(window.history)
const addressChanged = () => {
  for (const listener of [...router.addressChanged]) listener()
}
/** Whether Next is showing the page, or keeping it mounted and hidden. */
let setShown: (shown: boolean) => void = () => {}
const WORKSHOPS = '/admin/workshops'
const showIfOnThePage = () => setShown(window.location.pathname === WORKSHOPS)
/**
 * The organizer arrives at this route by a link (the count on a sponsor's
 * record) while the page is still mounted: A NEW HISTORY ENTRY, as a
 * navigation makes, with Next showing the page it kept.
 */
const arriveAt = (address: string) =>
  act(() => {
    realPushState(null, '', address)
    addressChanged()
    showIfOnThePage()
  })
/** A navigation to another route: a new entry, and this page is kept hidden. */
const leaveTo = (address: string) => arriveAt(address)
/** Back or Forward: an EXISTING entry is shown again, with its own state. */
const traverse = (direction: 'back' | 'forward') =>
  act(async () => {
    const arrived = new Promise((resolve) =>
      window.addEventListener('popstate', resolve, { once: true }),
    )
    window.history[direction]()
    await arrived
    addressChanged()
    showIfOnThePage()
  })

const SERVER_RENDER = [
  {
    _id: 'ws-1',
    title: 'Kubernetes 101',
    format: 'workshop_120',
    capacity: 30,
    signups: 2,
    waitlistCount: 0,
    available: 28,
    speakers: [],
  },
] as unknown as ProposalWithWorkshopData[]

const ACME = { _id: 'sfc-acme', name: 'Acme AS' }
const GLOBEX = { _id: 'sfc-globex', name: 'Globex' }
const K8S = { _id: 'ws-1', title: 'Kubernetes 101' }
const early = (
  id: string,
  userName: string,
  sponsor: { _id: string; name: string } | null,
  status = 'confirmed',
) => ({
  _id: id,
  userName,
  userEmail: `${id}@example.com`,
  status,
  signedUpAt: '2026-06-09T08:00:00Z',
  workshop: K8S,
  earlyAccess: { sponsor },
})

/** A sign-up as the dialog's two reads answer it. */
const dialogRow = (
  id: string,
  userName: string,
  earlyAccess: unknown,
  status = 'confirmed',
) => ({
  _id: id,
  _type: 'workshopSignup',
  userName,
  userEmail: `${id}@example.com`,
  userWorkOSId: id,
  status,
  signedUpAt: '2026-06-09T08:00:00Z',
  _createdAt: '2026-06-09T08:00:00Z',
  workshop: { _ref: 'ws-1', _id: 'ws-1', title: 'Kubernetes 101' },
  earlyAccess,
})

const server = {
  /** `getAllSignups`: the page's first hundred sign-ups. */
  general: [] as ReturnType<typeof dialogRow>[],
  /** `listSignups`: one workshop's sign-ups of one status. */
  ofWorkshop: [] as ReturnType<typeof dialogRow>[],
  /** While set, `listSignups` waits on it. */
  holdOfWorkshop: null as Promise<void> | null,
  /** `listEarlySignups`, by the sponsor in its input (`''`: none). */
  early: {} as Record<
    string,
    { signups: ReturnType<typeof early>[]; sponsors: (typeof ACME)[] }
  >,
  /** The input of every read of the list, in order. */
  earlyInputs: [] as unknown[],
  /** How often the sponsor CRM board's rows (`sponsor.crm.list`) were read. */
  boardReads: 0,
  /** The next delete is answered "not found": the attendee had cancelled. */
  deleteRefused: false,
}

const ok = (data: unknown) => ({ result: { data } })

const scrollIntoView = vi.fn()
/** The id of each element the page brought into view, in order. */
const broughtIntoView = () =>
  scrollIntoView.mock.contexts.map((element) => (element as Element).id)

async function answer(procedure: string, input: unknown): Promise<unknown> {
  switch (procedure) {
    case 'sponsor.crm.list':
      server.boardReads += 1
      return ok([])
    case 'workshop.admin.batchCancelSignups':
    case 'workshop.admin.batchConfirmSignups':
      return ok({
        success: true,
        message: 'unused',
        results: { succeeded: 1, failed: 0, total: 1 },
      })
    case 'workshop.admin.getAllSignups':
      return ok({ success: true, data: server.general })
    case 'workshop.admin.listSignups': {
      if (server.holdOfWorkshop) await server.holdOfWorkshop
      const { status } = input as { status?: string }
      const data = server.ofWorkshop.filter((row) => row.status === status)
      return ok({ success: true, data, count: data.length })
    }
    case 'workshop.admin.getSummary':
      return ok({
        success: true,
        data: {
          workshops: [
            {
              workshopId: 'ws-1',
              workshopTitle: 'Kubernetes 101',
              capacity: 30,
              totalSignups: 2,
              confirmedSignups: 2,
              waitlistSignups: 0,
              utilization: 6.7,
            },
          ],
          totals: {},
        },
      })
    case 'workshop.admin.listEarlySignups': {
      server.earlyInputs.push(input)
      const { sponsorId = '' } = (input ?? {}) as { sponsorId?: string }
      return ok(server.early[sponsorId] ?? { signups: [], sponsors: [] })
    }
    case 'workshop.admin.deleteSignup': {
      if (server.deleteRefused) {
        return {
          error: {
            message: 'Not found',
            code: -32004,
            data: { code: 'NOT_FOUND', httpStatus: 404 },
          },
        }
      }
      const { signupId } = input as { signupId: string }
      for (const answered of Object.values(server.early)) {
        answered.signups = answered.signups.filter(
          (row) => row._id !== signupId,
        )
      }
      server.ofWorkshop = server.ofWorkshop.filter(
        (row) => row._id !== signupId,
      )
      return ok({ success: true, message: 'unused' })
    }
    default:
      throw new Error(`unexpected procedure ${procedure}`)
  }
}

beforeEach(() => {
  Object.assign(server, {
    general: [],
    ofWorkshop: [],
    holdOfWorkshop: null,
    early: {
      '': {
        signups: [
          early('su-ada', 'Ada Lovelace', ACME),
          early('su-gus', 'Gus Grissom', GLOBEX, 'waitlist'),
          // Its sponsor was removed from the conference.
          early('su-cy', 'Cy Young', null),
        ],
        sponsors: [ACME, GLOBEX],
      },
      // NARROWED BY THE SERVER. Zoe is in no other answer: she stands for a
      // match the browser holds nowhere.
      'sfc-acme': {
        signups: [
          early('su-ada', 'Ada Lovelace', ACME),
          early('su-zoe', 'Zoe Late', ACME),
        ],
        sponsors: [ACME, GLOBEX],
      },
    },
    earlyInputs: [],
    boardReads: 0,
    deleteRefused: false,
  })
  boardOnThePage = 'none'
  vi.stubGlobal('alert', vi.fn())
  server.early['sfc-globex'] = {
    signups: [early('su-gus', 'Gus Grissom', GLOBEX, 'waitlist')],
    sponsors: [ACME, GLOBEX],
  }
  router.replace.mockReset()
  router.refresh.mockReset()
  // jsdom lays nothing out and has no `scrollIntoView`: what is asserted is
  // WHICH element the page asks the browser to bring into view, and when.
  scrollIntoView.mockReset()
  Element.prototype.scrollIntoView = scrollIntoView
  realReplaceState(null, '', '/admin/workshops')
  // As Next's patched `replaceState`: the entry keeps the state it is given,
  // and whoever reads the address is told when it changed.
  vi.spyOn(window.history, 'replaceState').mockImplementation(
    (state, _unused, address) => {
      realReplaceState(state, '', address ?? undefined)
      if (address != null) addressChanged()
    },
  )
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
      return new Response(JSON.stringify(answers), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
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

/** The page, opened at this address. */
function renderPage(address = '/admin/workshops', state: unknown = null) {
  realReplaceState(state, '', address)
  render(<KeptRoute />)
}

/**
 * The page as Next holds it with Cache Components: inside an `<Activity>`
 * that is hidden, not unmounted, while the organizer is on another route.
 */
function KeptRoute() {
  const [shown, set] = useState(true)
  const [boardShown, setBoard] = useState(boardOnThePage === 'shown')
  useEffect(() => {
    setShown = set
    setBoardShown = setBoard
  }, [])
  return (
    <Providers>
      <Activity mode={shown ? 'visible' : 'hidden'}>
        <WorkshopsClientPage
          conferenceId="conf-1"
          initialWorkshops={SERVER_RENDER}
          resendDisabledReason={null}
        />
      </Activity>
      {boardOnThePage !== 'none' && (
        <Activity mode={boardShown ? 'visible' : 'hidden'}>
          <SponsorBoard />
        </Activity>
      )}
    </Providers>
  )
}

/**
 * The sponsor CRM board, as far as this page is concerned: a reader of
 * `sponsor.crm.list`, whose rows carry each sponsor's count of early
 * sign-ups. The REAL query hook, on the same query client as the page.
 */
function SponsorBoard() {
  api.sponsor.crm.list.useQuery()
  return null
}
/** Whether the board is in the tree at all, and if so shown or kept hidden. */
let boardOnThePage: 'none' | 'shown' | 'kept hidden' = 'none'
let setBoardShown: (shown: boolean) => void = () => {}

const list = () => screen.getByRole('region', { name: 'Early sign-ups' })
/** Name, status and sponsor of each row of the list's table. */
const rows = () =>
  within(within(list()).getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((tr) => {
      const cells = within(tr).getAllByRole('cell')
      return [
        cells[0].firstElementChild?.firstElementChild?.textContent,
        cells[2].textContent,
        cells[3].textContent,
      ]
    })
const narrowTo = (sponsorId: string) =>
  fireEvent.change(within(list()).getByRole('combobox', { name: 'Sponsor' }), {
    target: { value: sponsorId },
  })

describe('the "Early sign-ups" list on the page', () => {
  it('shows the early sign-ups the server answers, from one read without a sponsor', async () => {
    renderPage()

    await waitFor(() =>
      expect(rows()).toEqual([
        ['Ada Lovelace', 'Confirmed', 'Acme AS'],
        ['Gus Grissom', 'Waitlist', 'Globex'],
        ['Cy Young', 'Confirmed', 'early access'],
      ]),
    )
    expect(server.earlyInputs).toEqual([{}])
  })

  it('is narrowed BY THE SERVER: the sponsor goes in the read’s input, and the rows are that read’s answer', async () => {
    renderPage()
    await waitFor(() => expect(rows()).toHaveLength(3))

    narrowTo('sfc-acme')

    // Zoe is in the narrowed answer only: no filtering of what the browser
    // already held could have produced her row.
    await waitFor(() =>
      expect(rows()).toEqual([
        ['Ada Lovelace', 'Confirmed', 'Acme AS'],
        ['Zoe Late', 'Confirmed', 'Acme AS'],
      ]),
    )
    expect(server.earlyInputs).toEqual([{}, { sponsorId: 'sfc-acme' }])
    expect(
      within(list()).getByText('2 early sign-ups through Acme AS'),
    ).toBeVisible()
  })

  it('shows no rows of the earlier answer while the narrowed one is on its way', async () => {
    renderPage()
    await waitFor(() => expect(rows()).toHaveLength(3))

    narrowTo('sfc-acme')

    // At once: the three rows are gone, and the control is still there.
    expect(within(list()).queryByRole('table')).toBeNull()
    expect(within(list()).getByRole('status')).toHaveTextContent(
      'Reading the early sign-ups…',
    )
    expect(
      within(list()).getByRole('combobox', { name: 'Sponsor' }),
    ).toHaveValue('sfc-acme')
    await waitFor(() => expect(rows()).toHaveLength(2))
  })

  it('opened from a sponsor’s record, asks for that sponsor only', async () => {
    renderPage('/admin/workshops?earlySponsor=sfc-acme#early-sign-ups')

    await waitFor(() =>
      expect(rows()).toEqual([
        ['Ada Lovelace', 'Confirmed', 'Acme AS'],
        ['Zoe Late', 'Confirmed', 'Acme AS'],
      ]),
    )
    expect(server.earlyInputs).toEqual([{ sponsorId: 'sfc-acme' }])
    expect(
      within(list()).getByRole('combobox', { name: 'Sponsor' }),
    ).toHaveValue('sfc-acme')
  })

  // The two paths an organizer takes (#1348, review): the page was visited
  // before, Next kept it mounted, and the count's link on a sponsor's record
  // brings them back to it with a sponsor in the address.
  describe('follows the address while it stays mounted', () => {
    it('seen un-narrowed first, then opened from a sponsor’s record: narrowed to that sponsor', async () => {
      renderPage()
      await waitFor(() => expect(rows()).toHaveLength(3))

      arriveAt('/admin/workshops?earlySponsor=sfc-globex#early-sign-ups')

      await waitFor(() =>
        expect(rows()).toEqual([['Gus Grissom', 'Waitlist', 'Globex']]),
      )
      expect(server.earlyInputs).toEqual([{}, { sponsorId: 'sfc-globex' }])
      expect(
        within(list()).getByRole('combobox', { name: 'Sponsor' }),
      ).toHaveValue('sfc-globex')
    })

    it('narrowed to one sponsor with the control, then opened from ANOTHER sponsor’s record: narrowed to the second', async () => {
      renderPage()
      await waitFor(() => expect(rows()).toHaveLength(3))
      narrowTo('sfc-acme')
      await waitFor(() => expect(rows()).toHaveLength(2))

      arriveAt('/admin/workshops?earlySponsor=sfc-globex#early-sign-ups')

      await waitFor(() =>
        expect(rows()).toEqual([['Gus Grissom', 'Waitlist', 'Globex']]),
      )
      expect(server.earlyInputs).toEqual([
        {},
        { sponsorId: 'sfc-acme' },
        { sponsorId: 'sfc-globex' },
      ])
      expect(
        within(list()).getByRole('combobox', { name: 'Sponsor' }),
      ).toHaveValue('sfc-globex')
    })

    it('opened without a sponsor after being narrowed: every sponsor again', async () => {
      renderPage('/admin/workshops?earlySponsor=sfc-acme')
      await waitFor(() => expect(rows()).toHaveLength(2))

      arriveAt('/admin/workshops')

      await waitFor(() => expect(rows()).toHaveLength(3))
      expect(
        within(list()).getByRole('combobox', { name: 'Sponsor' }),
      ).toHaveValue('')
    })
  })

  it.each([
    ['an empty sponsor', '/admin/workshops?earlySponsor='],
    [
      'one longer than an id',
      `/admin/workshops?earlySponsor=${'x'.repeat(201)}`,
    ],
  ])(
    'opened with %s in the address, shows every sponsor and asks the server for nothing else',
    async (_case, address) => {
      renderPage(address)

      await waitFor(() => expect(rows()).toHaveLength(3))
      expect(server.earlyInputs).toEqual([{}])
      expect(
        within(list()).getByRole('combobox', { name: 'Sponsor' }),
      ).toHaveValue('')
    },
  )

  it('writes the narrowing to the address, with the list’s anchor, without asking the server for the page again', async () => {
    renderPage()
    await waitFor(() => expect(rows()).toHaveLength(3))

    narrowTo('sfc-acme')
    // What the count's link on the sponsor's record points at: a reload
    // shows the same list, and scrolls to it.
    expect(
      window.location.pathname + window.location.search + window.location.hash,
    ).toBe('/admin/workshops?earlySponsor=sfc-acme#early-sign-ups')

    narrowTo('')
    expect(
      window.location.pathname + window.location.search + window.location.hash,
    ).toBe('/admin/workshops#early-sign-ups')
    expect(router.refresh).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
    // Back to every sponsor: answered from what was read a moment ago.
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(server.earlyInputs).toEqual([{}, { sponsorId: 'sfc-acme' }])
  })

  it('keeps the rest of the address as it is', async () => {
    renderPage('/admin/workshops?tab=tickets#early-sign-ups')
    await waitFor(() => expect(rows()).toHaveLength(3))

    narrowTo('sfc-acme')
    expect(window.location.search + window.location.hash).toBe(
      '?tab=tickets&earlySponsor=sfc-acme#early-sign-ups',
    )
    await waitFor(() => expect(rows()).toHaveLength(2))

    narrowTo('')
    expect(window.location.search + window.location.hash).toBe(
      '?tab=tickets#early-sign-ups',
    )
    await waitFor(() => expect(rows()).toHaveLength(3))
  })

  it('is read again after an organizer deletes a sign-up', async () => {
    server.ofWorkshop = [dialogRow('su-ada', 'Ada Lovelace', { sponsor: ACME })]
    renderPage()
    await waitFor(() => expect(rows()).toHaveLength(3))

    fireEvent.click(
      await screen.findByRole('button', { name: /^Confirmed\s*2$/ }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Kubernetes 101 - Confirmed Signups',
    })
    await within(dialog).findAllByText('Ada Lovelace')
    fireEvent.click(within(dialog).getAllByTitle('Delete participant')[0])
    const confirm = within(
      await screen.findByRole('dialog', { name: 'Delete signup' }),
    ).getByRole('button', { name: 'Delete' })
    await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'))
    fireEvent.click(confirm)

    await waitFor(() => expect(server.earlyInputs).toEqual([{}, {}]))
    // The list sits behind the open dialog, which hides it from assistive
    // technology; `hidden` finds it all the same.
    const behind = { hidden: true }
    const table = () =>
      within(
        screen.getByRole('region', { name: 'Early sign-ups', ...behind }),
      ).getByRole('table', behind)
    await waitFor(() =>
      expect(
        within(table())
          .getAllByRole('row', behind)
          .slice(1)
          .map(
            (tr) =>
              within(tr).getAllByRole('cell', behind)[0].firstElementChild
                ?.firstElementChild?.textContent,
          ),
      ).toEqual(['Gus Grissom', 'Cy Young']),
    )
  })
})

/**
 * THE COUNT ON A SPONSOR'S RECORD AFTER A DELETE (#1348, review). The count is
 * a field of the sponsor CRM board's rows (`sponsor.crm.list`), read at most
 * once a minute. An organizer who came by the count's link, deletes a sign-up
 * and goes back would see the old count. So a delete marks those rows stale.
 * Only a delete: a confirm and a move change no count.
 *
 * Real here: the query client and `invalidate`. A query nobody is showing is
 * marked stale and NOT read: the read happens when its board is shown again.
 */
describe('the sponsor board’s rows after an action on a sign-up', () => {
  /** Open the confirmed list of the workshop: Ada is in it. */
  async function openTheDialog(status: 'confirmed' | 'waitlist' = 'confirmed') {
    server.ofWorkshop = [
      dialogRow('su-ada', 'Ada Lovelace', { sponsor: ACME }, status),
    ]
    renderPage()
    await waitFor(() => expect(rows()).toHaveLength(3))
    fireEvent.click(
      await screen.findByRole('button', {
        name: status === 'confirmed' ? /^Confirmed\s*2$/ : /^Waitlist\s*0$/,
      }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: `Kubernetes 101 - ${status === 'confirmed' ? 'Confirmed' : 'Waitlist'} Signups`,
    })
    await within(dialog).findAllByText('Ada Lovelace')
    return dialog
  }
  /** Press the confirm button of the question that is open, once it listens. */
  async function answerTheQuestion(title: string, button: string) {
    const confirm = within(
      await screen.findByRole('dialog', { name: title }),
    ).getByRole('button', { name: button })
    await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'))
    fireEvent.click(confirm)
  }
  async function deleteAda() {
    const dialog = await openTheDialog()
    fireEvent.click(within(dialog).getAllByTitle('Delete participant')[0])
    await answerTheQuestion('Delete signup', 'Delete')
    // The page's own lists have been read again: the delete has settled.
    await waitFor(() => expect(server.earlyInputs).toEqual([{}, {}]))
  }

  it('a delete makes a board that is on screen read its rows again', async () => {
    boardOnThePage = 'shown'
    await deleteAda()

    await waitFor(() => expect(server.boardReads).toBe(2))
  })

  it('a delete the server refused does too: the sign-up may be gone all the same', async () => {
    boardOnThePage = 'shown'
    server.deleteRefused = true
    await deleteAda()

    await waitFor(() => expect(server.boardReads).toBe(2))
  })

  it('"Move to waitlist" does not: it changes no count', async () => {
    boardOnThePage = 'shown'
    const dialog = await openTheDialog()
    fireEvent.click(
      within(dialog).getAllByRole('button', { name: 'Move to waitlist' })[0],
    )
    await answerTheQuestion('Move to waitlist', 'Move to waitlist')

    await waitFor(() => expect(server.earlyInputs).toEqual([{}, {}]))
    expect(server.boardReads).toBe(1)
  })

  it('"Move to Confirmed" does not either', async () => {
    boardOnThePage = 'shown'
    const dialog = await openTheDialog('waitlist')
    fireEvent.click(
      within(dialog).getAllByRole('button', { name: 'Move to Confirmed' })[0],
    )

    await waitFor(() => expect(server.earlyInputs).toEqual([{}, {}]))
    expect(server.boardReads).toBe(1)
  })

  it('a board Next keeps hidden is not read by the delete, and is read when it is shown again', async () => {
    boardOnThePage = 'shown'
    const dialog = await openTheDialog()
    await waitFor(() => expect(server.boardReads).toBe(1))
    // The organizer left the board for this page: Next keeps it, hidden.
    act(() => setBoardShown(false))

    fireEvent.click(within(dialog).getAllByTitle('Delete participant')[0])
    await answerTheQuestion('Delete signup', 'Delete')
    await waitFor(() => expect(server.earlyInputs).toEqual([{}, {}]))

    // Hidden: marked stale, not read.
    expect(server.boardReads).toBe(1)

    // The organizer goes back to the board: its rows are read again.
    act(() => setBoardShown(true))
    await waitFor(() => expect(server.boardReads).toBe(2))
  })

  it('with no board in the tree, a delete asks the server for no sponsor rows', async () => {
    await deleteAda()

    expect(server.boardReads).toBe(0)
  })
})

/**
 * THE COUNT'S LINK ENDS AT THE LIST, NOT AT THE TOP OF THE PAGE (#1348,
 * review round 2). The list is the last section of the page, and Next applies
 * a link's fragment once, at the first commit of the navigation, which is the
 * route's loading state: the section is not there yet (or is hidden, on a page
 * Next kept). So the page brings the list into view itself, when the address
 * carries the list's fragment.
 */
describe('arriving with the list’s fragment in the address', () => {
  it('brings the list’s section into view', async () => {
    renderPage('/admin/workshops?earlySponsor=sfc-acme#early-sign-ups')
    await waitFor(() => expect(rows()).toHaveLength(2))

    expect(broughtIntoView()).toEqual(['early-sign-ups'])
    expect(scrollIntoView.mock.contexts[0]).toBe(list())
  })

  it('does so without a sponsor too', async () => {
    renderPage('/admin/workshops#early-sign-ups')
    await waitFor(() => expect(rows()).toHaveLength(3))

    expect(broughtIntoView()).toEqual(['early-sign-ups'])
  })

  it.each([
    ['an ordinary view', '/admin/workshops'],
    [
      'a sponsor in the address and no fragment',
      '/admin/workshops?earlySponsor=sfc-acme',
    ],
    [
      'another section’s fragment',
      '/admin/workshops?earlySponsor=sfc-acme#workshop-tickets',
    ],
  ])('moves nothing for %s', async (_case, address) => {
    renderPage(address)
    await waitFor(() => expect(within(list()).getByRole('table')).toBeVisible())

    expect(broughtIntoView()).toEqual([])
  })

  it('brings it into view AGAIN when a page that stayed mounted is opened for another sponsor', async () => {
    renderPage('/admin/workshops?earlySponsor=sfc-acme#early-sign-ups')
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(broughtIntoView()).toEqual(['early-sign-ups'])

    arriveAt('/admin/workshops?earlySponsor=sfc-globex#early-sign-ups')
    await waitFor(() => expect(rows()).toHaveLength(1))

    expect(broughtIntoView()).toEqual(['early-sign-ups', 'early-sign-ups'])
  })

  it('brings it into view when a page first seen without the fragment is opened by the count’s link', async () => {
    renderPage()
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(broughtIntoView()).toEqual([])

    arriveAt('/admin/workshops?earlySponsor=sfc-globex#early-sign-ups')
    await waitFor(() => expect(rows()).toHaveLength(1))

    expect(broughtIntoView()).toEqual(['early-sign-ups'])
  })

  it('moves nothing when the organizer narrows with the control: they are at the list already', async () => {
    renderPage()
    await waitFor(() => expect(rows()).toHaveLength(3))

    narrowTo('sfc-acme')
    await waitFor(() => expect(rows()).toHaveLength(2))
    // The address now carries the fragment, written by the control.
    expect(window.location.hash).toBe('#early-sign-ups')
    narrowTo('')
    await waitFor(() => expect(rows()).toHaveLength(3))

    expect(broughtIntoView()).toEqual([])
  })

  it('still follows the count’s link after the control was used', async () => {
    renderPage()
    await waitFor(() => expect(rows()).toHaveLength(3))
    narrowTo('sfc-acme')
    await waitFor(() => expect(rows()).toHaveLength(2))

    arriveAt('/admin/workshops?earlySponsor=sfc-globex#early-sign-ups')
    await waitFor(() => expect(rows()).toHaveLength(1))

    expect(broughtIntoView()).toEqual(['early-sign-ups'])
  })
})

/**
 * ONCE PER HISTORY ENTRY (#1348, review round 3). Next shows a kept page
 * again by reactivating it, which runs its effects again, and the fragment is
 * still in the address: without a rule, Back to the page would throw the
 * organizer from wherever they had scrolled to down to the list. An ARRIVAL
 * (a link, a hard load) is a new entry and brings the list into view; a
 * RETURN to an entry that was already shown the list (Back, Forward) moves
 * nothing, and the position is the browser's and Next's to restore.
 */
describe('returning to a history entry that was already shown the list', () => {
  const LINK = '/admin/workshops?earlySponsor=sfc-acme#early-sign-ups'

  it('Back to it moves nothing', async () => {
    renderPage(LINK)
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(broughtIntoView()).toEqual(['early-sign-ups'])

    leaveTo('/admin/sponsors/crm')
    await traverse('back')

    expect(
      window.location.pathname + window.location.search + window.location.hash,
    ).toBe(LINK)
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(broughtIntoView()).toEqual(['early-sign-ups'])
  })

  it('Back away from it, then Forward to it, moves nothing', async () => {
    renderPage('/admin/sponsors/crm')
    arriveAt(LINK)
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(broughtIntoView()).toEqual(['early-sign-ups'])

    await traverse('back')
    expect(window.location.pathname).toBe('/admin/sponsors/crm')
    await traverse('forward')

    expect(
      window.location.pathname + window.location.search + window.location.hash,
    ).toBe(LINK)
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(broughtIntoView()).toEqual(['early-sign-ups'])
  })

  it('a NEW arrival by the same link brings the list into view again', async () => {
    renderPage(LINK)
    await waitFor(() => expect(rows()).toHaveLength(2))

    leaveTo('/admin/sponsors/crm')
    arriveAt(LINK)
    await waitFor(() => expect(rows()).toHaveLength(2))

    expect(broughtIntoView()).toEqual(['early-sign-ups', 'early-sign-ups'])
  })

  it('Back to an entry the organizer narrowed with the control moves nothing', async () => {
    renderPage()
    await waitFor(() => expect(rows()).toHaveLength(3))
    narrowTo('sfc-acme')
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(window.location.hash).toBe('#early-sign-ups')

    leaveTo('/admin/sponsors/crm')
    await traverse('back')

    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(broughtIntoView()).toEqual([])
  })

  it('marks the entry beside what Next keeps in its state, and loses none of it', async () => {
    // The entry as Next wrote it before the page's effects ran.
    renderPage(LINK, { __NA: true, kept: 'by Next' })
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(broughtIntoView()).toEqual(['early-sign-ups'])

    expect(window.history.state).toEqual({
      __NA: true,
      kept: 'by Next',
      earlySignupsShown: true,
    })

    // Shown again, as after Back: the entry carries the mark.
    act(() => setShown(false))
    act(() => setShown(true))
    expect(broughtIntoView()).toEqual(['early-sign-ups'])
  })
})

describe('the badge in a workshop’s sign-up dialog, from both reads that feed it', () => {
  it('is shown from the page’s general read first, and then from the workshop’s own read', async () => {
    // The two reads name the sponsor differently, so the badge says which
    // read it came from.
    server.general = [
      dialogRow('su-ada', 'Ada Lovelace', { sponsor: ACME }),
      dialogRow('su-bob', 'Bob Smith', null),
    ]
    server.ofWorkshop = [
      dialogRow('su-ada', 'Ada Lovelace', {
        sponsor: { _id: 'sfc-acme', name: 'Acme Renamed' },
      }),
      dialogRow('su-bob', 'Bob Smith', null),
    ]
    let release = () => {}
    server.holdOfWorkshop = new Promise<void>((resolve) => (release = resolve))
    renderPage()

    fireEvent.click(
      await screen.findByRole('button', { name: /^Confirmed\s*2$/ }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Kubernetes 101 - Confirmed Signups',
    })

    // From the general read: the workshop's own has not answered.
    expect(await within(dialog).findAllByText('via Acme AS')).toHaveLength(2)
    expect(within(dialog).queryAllByText(/^via /)).toHaveLength(2)

    release()

    expect(await within(dialog).findAllByText('via Acme Renamed')).toHaveLength(
      2,
    )
    expect(within(dialog).queryAllByText(/^via /)).toHaveLength(2)
  })
})
