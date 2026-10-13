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
  'Sponsor early access must start before registration opens for everyone. Sponsor Early Access Opens is set to 1. juni 2026 kl. 08:00.'

const h = vi.hoisted(() => ({
  /** What is stored: what the page hands the card when it is read again. */
  stored: {} as Record<string, string | undefined>,
  /** The input of every save that reached the server. */
  saves: [] as unknown[],
  /** How the server answers the next save: a refusal's text, or nothing. */
  refuseWith: null as string | null,
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

beforeEach(() => {
  Object.assign(h, { stored: {}, saves: [], refuseWith: null, refreshes: 0 })
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
      screen.getByRole('button', { name: 'Edit Workshop Registration' }),
    )
    expect(field(/Sponsor Early Access Opens/).value).toBe('')

    // The organizer moves the opening to 30 May, before that sponsor start.
    fireEvent.change(field(/Registration Opens/), {
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

    // The card was read again, once, and the form took in what is stored…
    expect(h.refreshes).toBe(1)
    expect(field(/Sponsor Early Access Opens/).value).toBe('2026-06-01T08:00')
    // …without discarding what the organizer typed, or the refusal.
    expect(field(/Registration Opens/).value).toBe('2026-05-30T09:00')
    expect(
      within(screen.getByRole('dialog')).getByRole('alert'),
    ).toHaveTextContent(REFUSAL)

    // Now the time can be cleared: emptying the field IS a change.
    fireEvent.change(field(/Sponsor Early Access Opens/), {
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
      screen.getByRole('button', { name: 'Edit Workshop Registration' }),
    )
    fireEvent.change(field(/Registration Closes/), {
      target: { value: '2026-07-02T10:00' },
    })
    save()

    await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0))
    expect(h.saves).toEqual([{ endDate: '2026-07-02T08:00:00.000Z' }])
    expect(h.refreshes).toBe(1)
    // An accepted save still says so in a toast, as it did before.
    expect(screen.getAllByText('Workshop Registration saved.')).toHaveLength(1)
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
    expect(row('Registration Opens')).toBe('20. oktober 2026 kl. 09:00')

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Workshop Registration' }),
    )
    // Retyped as it stands: 20 October is what the form believes is stored.
    fireEvent.change(field(/Registration Opens/), {
      target: { value: '2026-10-20T09:00' },
    })
    save()

    await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0))
    expect(h.saves).toEqual([])
    expect(h.refreshes).toBe(1)
    expect(row('Registration Opens')).toBe('21. oktober 2026 kl. 09:00')
  })
})
