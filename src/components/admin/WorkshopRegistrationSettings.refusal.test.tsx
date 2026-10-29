/**
 * @vitest-environment jsdom
 *
 * A REFUSED SAVE MUST BE RECOVERABLE (#1345, review round 2).
 *
 * The server judges a save against the times that are STORED, and the form
 * sends only what its organizer changed. So a form that was opened before a
 * colleague stored a sponsor start time can be refused about a time it does
 * not show, and could never clear: an empty field equals what the form was
 * opened with, so nothing would be sent for it.
 *
 * Two things make it recoverable, and both are asserted on the rendered form:
 * the refusal is shown as the server worded it, and the card is read again, so
 * the form takes in what is stored without discarding what was typed.
 *
 * Against the real tRPC client and query client, with only `fetch` supplied.
 * "The page" below stands in for the server component that hands the card its
 * props: `router.refresh()` makes it hand over what is stored.
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
import { useEffect, useState, type ReactNode } from 'react'
import { api, getTRPCClient } from '@/lib/trpc/client'
import { WorkshopRegistrationSettings } from './WorkshopRegistrationSettings'
import { NotificationProvider } from './NotificationProvider'

const SPONSOR = '2026-06-01T06:00:00.000Z'
const OFFICIAL = '2026-06-15T06:30:00.000Z'
const END = '2026-07-01T07:00:00.000Z'

type Times = Parameters<typeof WorkshopRegistrationSettings>[0]

const REFUSAL =
  'Sponsor early access must start before registration opens for everyone. Sponsor early access opens is set to 1. juni 2026 kl. 08:00.'

const h = vi.hoisted(() => ({
  /** What is stored: what the page hands the card when it is read again. */
  stored: {} as Record<string, string | undefined>,
  /** The input of every save that reached the server. */
  saves: [] as unknown[],
  /** How the server answers the next save: a refusal's text, or nothing. */
  refuseWith: null as string | null,
  /** While set, the server answers a save only after it. */
  hold: null as Promise<void> | null,
  refreshes: 0,
  rereadPage: () => {},
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: () => {
      h.refreshes += 1
      h.rereadPage()
    },
  }),
}))

/** jsdom has no `scrollIntoView`; this records what was asked to come into view. */
const scrolledIntoView = vi.fn<(this: Element, options?: unknown) => void>()

beforeEach(() => {
  scrolledIntoView.mockClear()
  Element.prototype.scrollIntoView = scrolledIntoView
  Object.assign(h, {
    stored: {},
    saves: [],
    refuseWith: null,
    hold: null,
    refreshes: 0,
  })
  vi.useFakeTimers({
    toFake: ['Date'],
    now: new Date('2026-05-20T12:00:00.000Z'),
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), 'http://localhost')
      if (pathname !== '/api/trpc/workshop.admin.updateRegistrationTimes') {
        throw new Error(`unexpected request ${pathname}`)
      }
      h.saves.push(JSON.parse(String(init?.body))['0'])
      const refusal = h.refuseWith
      h.refuseWith = null
      await h.hold
      return new Response(
        JSON.stringify([
          refusal
            ? {
                error: {
                  message: refusal,
                  code: -32600,
                  data: { code: 'BAD_REQUEST', httpStatus: 400 },
                },
              }
            : { result: { data: { success: true } } },
        ]),
        {
          status: refusal ? 400 : 200,
          headers: { 'content-type': 'application/json' },
        },
      )
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
    () => new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
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

/** The page: shows the card what it read last, and reads again on a refresh. */
function Page({ first }: { first: Times }) {
  const [times, setTimes] = useState(first)
  useEffect(() => {
    h.rereadPage = () => setTimes({ ...h.stored })
  }, [])
  return <WorkshopRegistrationSettings {...times} />
}

const field = (name: RegExp) =>
  within(screen.getByRole('dialog')).getByLabelText(name) as HTMLInputElement
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }))

describe('a save refused about a time the form does not show', () => {
  it('shows the refusal, takes in the stored time, keeps what was typed, and can then clear it', async () => {
    // The organizer's page was read when no sponsor start time was stored.
    render(
      <Providers>
        <Page
          first={{
            workshopRegistrationStart: OFFICIAL,
            workshopRegistrationEnd: END,
          }}
        />
      </Providers>,
    )
    // A colleague has stored one since.
    h.stored = {
      workshopRegistrationSponsorStart: SPONSOR,
      workshopRegistrationStart: OFFICIAL,
      workshopRegistrationEnd: END,
    }

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit workshop registration' }),
    )
    expect(field(/Sponsor early access opens/).value).toBe('')
    // No refusal yet: nothing describes the fields but the sponsor field's help.
    expect({
      sponsorStart: field(/Sponsor early access opens/).getAttribute(
        'aria-describedby',
      ),
      start: field(/Registration opens/).getAttribute('aria-describedby'),
      end: field(/Registration closes/).getAttribute('aria-describedby'),
    }).toEqual({
      sponsorStart: 'workshop-reg-sponsor-start-help',
      start: null,
      end: null,
    })
    expect(scrolledIntoView.mock.calls).toEqual([])

    // The organizer moves the opening to 30 May, before that sponsor start.
    fireEvent.change(field(/Registration opens/), {
      target: { value: '2026-05-30T09:00' },
    })
    h.refuseWith = REFUSAL
    save()

    // The refusal, as the server worded it, in the form.
    await waitFor(() =>
      expect(
        within(screen.getByRole('dialog')).getByRole('alert'),
      ).toHaveTextContent(REFUSAL),
    )
    expect(h.saves).toEqual([{ startDate: '2026-05-30T07:00:00.000Z' }])
    // Said once, in the form, where it stays: not also in a toast, which on a
    // phone covers the fields and Save.
    expect(screen.getAllByText(REFUSAL)).toHaveLength(1)
    // BROUGHT INTO VIEW: on a short screen the refusal is above the Save
    // button that was just tapped. Asked of the refusal itself, once, and no
    // further than it has to move.
    const alert = within(screen.getByRole('dialog')).getByRole('alert')
    expect(scrolledIntoView.mock.contexts).toEqual([alert])
    expect(scrolledIntoView.mock.calls).toEqual([[{ block: 'nearest' }]])
    // TIED TO THE FIELDS: each one is described by it, the sponsor field by
    // its help text as well.
    expect(alert.id).toBe('workshop-reg-error')
    expect({
      sponsorStart: field(/Sponsor early access opens/).getAttribute(
        'aria-describedby',
      ),
      start: field(/Registration opens/).getAttribute('aria-describedby'),
      end: field(/Registration closes/).getAttribute('aria-describedby'),
    }).toEqual({
      sponsorStart: 'workshop-reg-sponsor-start-help workshop-reg-error',
      start: 'workshop-reg-error',
      end: 'workshop-reg-error',
    })

    // The card was read again, once, and the form took in what is stored…
    expect(h.refreshes).toBe(1)
    expect(field(/Sponsor early access opens/).value).toBe('2026-06-01T08:00')
    // …without discarding what the organizer typed, or the refusal.
    expect(field(/Registration opens/).value).toBe('2026-05-30T09:00')
    expect(
      within(screen.getByRole('dialog')).getByRole('alert'),
    ).toHaveTextContent(REFUSAL)

    // Now the time can be cleared: emptying the field IS a change.
    fireEvent.change(field(/Sponsor early access opens/), {
      target: { value: '' },
    })
    save()

    await waitFor(() => expect(h.saves).toHaveLength(2))
    expect(h.saves[1]).toEqual({
      sponsorStartDate: null,
      startDate: '2026-05-30T07:00:00.000Z',
    })
  })

  it('CONTROL: an accepted save reads the card again too, and closes the form', async () => {
    render(
      <Providers>
        <Page
          first={{
            workshopRegistrationStart: OFFICIAL,
            workshopRegistrationEnd: END,
          }}
        />
      </Providers>,
    )
    h.stored = {
      workshopRegistrationStart: OFFICIAL,
      workshopRegistrationEnd: '2026-07-02T08:00:00.000Z',
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit workshop registration' }),
    )
    fireEvent.change(field(/Registration closes/), {
      target: { value: '2026-07-02T10:00' },
    })
    save()

    await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0))
    expect(h.saves).toEqual([{ endDate: '2026-07-02T08:00:00.000Z' }])
    expect(h.refreshes).toBe(1)
    // An accepted save still says so in a toast, as it did before.
    expect(screen.getAllByText('Workshop registration saved.')).toHaveLength(1)
  })
})

/**
 * A SAVE THAT CHANGES NOTHING STILL ANSWERS FOR WHAT IS STORED (review round
 * 3). The form sends nothing when its fields equal what the card shows. If the
 * card is stale, closing in silence leaves the organizer looking at a time
 * they just "saved" that is not the stored one.
 */
describe('a save that changes nothing, over a card that is out of date', () => {
  /** What the card shows next to a row's name. */
  const row = (name: string) =>
    screen.getByText(name).nextElementSibling?.textContent

  it('sends nothing, reads the card again, and the card shows what is stored', async () => {
    // The organizer's page was read when registration opened on 20 October.
    render(
      <Providers>
        <Page
          first={{
            workshopRegistrationStart: '2026-10-20T07:00:00.000Z',
            workshopRegistrationEnd: '2026-11-01T08:00:00.000Z',
          }}
        />
      </Providers>,
    )
    // A colleague has moved it to 21 October since.
    h.stored = {
      workshopRegistrationStart: '2026-10-21T07:00:00.000Z',
      workshopRegistrationEnd: '2026-11-01T08:00:00.000Z',
    }
    expect(row('Registration opens')).toBe('20. oktober 2026 kl. 09:00')

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit workshop registration' }),
    )
    // Retyped as it stands: 20 October is what the form believes is stored.
    fireEvent.change(field(/Registration opens/), {
      target: { value: '2026-10-20T09:00' },
    })
    save()

    await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0))
    expect(h.saves).toEqual([])
    expect(h.refreshes).toBe(1)
    expect(row('Registration opens')).toBe('21. oktober 2026 kl. 09:00')
  })
})

/**
 * THE FORM STAYS WHILE A SAVE IS ON ITS WAY (adversarial round 2). The
 * refusal is shown in the form and nowhere else, so a form closed during
 * "Saving…" (the header X, Escape or the backdrop: one `onClose`) would report
 * a failed save nowhere. And a form closed and reopened during a save would be
 * closed again by that save's success, discarding what was typed since.
 *
 * Read as a value, at once: a dialog asked to close carries `data-leave` from
 * that moment until it is gone, so nothing here waits to see whether it goes.
 */
describe('closing the form while a save is pending', () => {
  const TIMES = {
    workshopRegistrationStart: OFFICIAL,
    workshopRegistrationEnd: END,
  }

  function formIs(): 'open' | 'opening' | 'closing' | 'gone' {
    const dialog = screen.queryByRole('dialog', { hidden: true })
    if (!dialog) return 'gone'
    if (dialog.hasAttribute('data-leave')) return 'closing'
    return dialog.hasAttribute('data-enter') ? 'opening' : 'open'
  }
  const pressEscape = () =>
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    })
  const pressTheX = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))

  async function openAndMoveTheEnd() {
    render(
      <Providers>
        <Page first={TIMES} />
      </Providers>,
    )
    h.stored = { ...TIMES }
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit workshop registration' }),
    )
    await waitFor(() => expect(formIs()).toBe('open'))
    fireEvent.change(field(/Registration closes/), {
      target: { value: '2026-07-02T10:00' },
    })
  }

  /** The save has reached the server, which is not answering yet. */
  async function saveAndHold(refusal: string | null) {
    let answer = () => {}
    h.hold = new Promise<void>((resolve) => (answer = resolve))
    h.refuseWith = refusal
    save()
    await waitFor(() => expect(h.saves).toHaveLength(1))
    return answer
  }

  it('CONTROL: with no save pending, the X closes it', async () => {
    await openAndMoveTheEnd()
    pressTheX()
    expect(formIs()).toBe('closing')
  })

  it('CONTROL: with no save pending, Escape closes it', async () => {
    await openAndMoveTheEnd()
    pressEscape()
    expect(formIs()).toBe('closing')
  })

  it('stays open under the X and Escape, so a save that is then refused is reported in it', async () => {
    await openAndMoveTheEnd()
    const answer = await saveAndHold(REFUSAL)

    pressTheX()
    expect(formIs()).toBe('open')
    pressEscape()
    expect(formIs()).toBe('open')

    answer()
    await waitFor(() =>
      expect(
        within(screen.getByRole('dialog')).getByRole('alert'),
      ).toHaveTextContent(REFUSAL),
    )
    expect(formIs()).toBe('open')
    // What was typed is still there to be corrected.
    expect(field(/Registration closes/).value).toBe('2026-07-02T10:00')
  })

  it('stays open under the X and Escape until the save’s success closes it', async () => {
    await openAndMoveTheEnd()
    const answer = await saveAndHold(null)

    pressEscape()
    expect(formIs()).toBe('open')
    pressTheX()
    expect(formIs()).toBe('open')

    answer()
    await waitFor(() => expect(formIs()).toBe('gone'))
    expect(h.saves).toEqual([{ endDate: '2026-07-02T08:00:00.000Z' }])
    expect(screen.getAllByText('Workshop registration saved.')).toHaveLength(1)
  })

  it('can be closed again once the refusal has arrived', async () => {
    await openAndMoveTheEnd()
    const answer = await saveAndHold(REFUSAL)
    answer()
    await screen.findByRole('alert')

    pressTheX()
    expect(formIs()).toBe('closing')
  })
})
