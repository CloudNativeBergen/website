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
import { useState, type ReactNode } from 'react'
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
function setAddress(address: string) {
  realReplaceState(null, '', address)
  for (const listener of [...router.addressChanged]) listener()
}
/**
 * The organizer arrives at this route again while the page is still mounted:
 * the link on a sponsor's record, with Next showing the page it kept.
 */
const arriveAt = (address: string) => act(() => setAddress(address))

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
}

const ok = (data: unknown) => ({ result: { data } })

async function answer(procedure: string, input: unknown): Promise<unknown> {
  switch (procedure) {
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
  })
  server.early['sfc-globex'] = {
    signups: [early('su-gus', 'Gus Grissom', GLOBEX, 'waitlist')],
    sponsors: [ACME, GLOBEX],
  }
  router.replace.mockReset()
  router.refresh.mockReset()
  realReplaceState(null, '', '/admin/workshops')
  vi.spyOn(window.history, 'replaceState').mockImplementation(
    (_state, _unused, address) => setAddress(String(address)),
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
function renderPage(address = '/admin/workshops') {
  realReplaceState(null, '', address)
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
