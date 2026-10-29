/**
 * @vitest-environment jsdom
 *
 * A HELD SEND MUST HAVE A WAY OUT (#1347, review round 2).
 *
 * The modal holds Send while it does not know that the server would send.
 * The question is asked once per open and never retried, so when the answer
 * could not be fetched (a network blip, on the first ask or on the re-ask
 * that follows a failed send) every press of Send was refused locally and
 * nothing asked again: only closing and reopening the modal helped. The
 * notice now carries "Check again".
 *
 * Against the REAL tRPC client and query client, with only `fetch` supplied:
 * what is pinned is what React Query does with a failed query and a refetch,
 * which a stubbed hook cannot show. `EmailModal` is the same small stand-in
 * as in `SponsorSendModal.earlyAccess.test.tsx`.
 */
import React, { useState, type ReactNode } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PortableTextBlock } from '@portabletext/editor'
import { api, getTRPCClient } from '@/lib/trpc/client'
import { mockContactPerson, mockSponsor } from '@/__mocks__/sponsor-data'

const READINESS = 'sponsor.crm.earlyAccess.getSendReadiness'
const SEND = 'sponsor.crm.sendCommunication'

const h = vi.hoisted(() => ({
  showNotification: vi.fn(),
  /** The network is down: every request fails before it is answered. */
  down: false,
  /** Every request that was made, by procedure, answered or not. */
  requests: [] as string[],
  /** The input of every send that was posted, answered or not. */
  posts: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: h.showNotification }),
}))
vi.mock('@/components/admin/sponsor/SponsorTemplatePicker', () => ({
  SponsorTemplatePicker: () => null,
}))
vi.mock('@/components/admin/EmailModal', () => ({
  EmailModal: ({
    isOpen,
    warningContent,
    initialValues,
    onSend,
  }: {
    isOpen: boolean
    warningContent?: ReactNode
    initialValues?: { subject?: string; message?: PortableTextBlock[] }
    onSend: (d: {
      subject: string
      message: PortableTextBlock[]
    }) => Promise<void>
  }) =>
    isOpen ? (
      <div>
        <div data-testid="warnings">{warningContent}</div>
        <button
          type="button"
          onClick={() =>
            onSend({
              subject: initialValues?.subject ?? '',
              message: initialValues?.message ?? [],
            }).catch((e: Error) => {
              h.showNotification({ type: 'error', title: e.message })
            })
          }
        >
          Send
        </button>
      </div>
    ) : null,
}))

import { SponsorSendModal } from '@/components/admin/sponsor/SponsorSendModal'

const READY = {
  refusal: null,
  url: null,
  sponsorStart: '2026-09-24T08:00:00.000Z',
  officialOpening: '2026-10-01T08:00:00.000Z',
}

function answerOf(procedure: string) {
  switch (procedure) {
    case READINESS:
      return { result: { data: READY } }
    case SEND:
      return { result: { data: { success: true, recipientCount: 1 } } }
    case 'sponsor.emailTemplates.list':
      return { result: { data: [] } }
    default:
      throw new Error(`unexpected request ${procedure}`)
  }
}

function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // The app's own defaults do not matter here: the readiness query
          // sets `retry: false` itself, which is what makes the hold stick.
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
  )
  const [trpcClient] = useState(() => getTRPCClient())
  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  )
}

const renderModal = () =>
  render(
    <Providers>
      <SponsorSendModal
        isOpen
        kind="workshop-early-access"
        onClose={vi.fn()}
        sponsorForConference={mockSponsor({
          _id: 'sfc-acme',
          status: 'closed-won',
          contactPersons: [
            mockContactPerson({
              _key: 'c-primary',
              name: 'Kari Nordmann',
              email: 'kari@acme.example',
              isPrimary: true,
            }),
          ],
        })}
        domain="conf.example.org"
        fromEmail="sponsors@conf.example.org"
        conference={{
          title: 'Cloud Native Days Bergen',
          city: 'Bergen',
          country: 'Norway',
          startDate: '2026-10-28',
          domains: ['conf.example.org'],
        }}
      />
    </Providers>,
  )

const asks = () => h.requests.filter((name) => name === READINESS).length
const pressSend = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
const checkAgain = () => screen.queryByRole('button', { name: 'Check again' })
const NOT_KNOWN = /^Could not check whether early access can be sent: /
/** The modal has an answer, and it is that the send may go ahead. */
const expectReady = () =>
  waitFor(() => {
    expect(screen.queryByRole('alert')).toBeNull()
    expect(
      screen.queryByText('Checking whether early access can be sent…'),
    ).toBeNull()
    expect(
      screen.getByText(
        'This sponsor has no early-access link yet. Sending creates it.',
      ),
    ).toBeVisible()
  })
/** Three presses of Send, each answered by the hold. */
async function pressSendThreeTimesInVain() {
  for (let press = 1; press <= 3; press++) {
    h.showNotification.mockClear()
    pressSend()
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith({
        type: 'error',
        title: expect.stringMatching(NOT_KNOWN),
      }),
    )
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  Object.assign(h, { down: false, requests: [], posts: [] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), 'http://localhost')
      const procedures = pathname.replace('/api/trpc/', '').split(',')
      h.requests.push(...procedures)
      if (init?.body) {
        const inputs = JSON.parse(String(init.body)) as Record<string, unknown>
        procedures.forEach((name, at) => {
          if (name === SEND)
            h.posts.push(inputs[String(at)] as Record<string, unknown>)
        })
      }
      if (h.down) throw new TypeError('Failed to fetch')
      return new Response(JSON.stringify(procedures.map(answerOf)), {
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

describe('the server could not be asked', () => {
  it('on the first ask: the notice offers "Check again", which asks once and frees Send', async () => {
    h.down = true
    renderModal()

    expect(await screen.findByRole('alert')).toHaveTextContent(NOT_KNOWN)
    expect(checkAgain()).toBeVisible()
    expect(asks()).toBe(1)

    // Send is held, and holding it asks nothing: the server coming back
    // changes nothing by itself.
    h.down = false
    await pressSendThreeTimesInVain()
    expect(h.posts).toEqual([])
    expect(asks()).toBe(1)

    fireEvent.click(checkAgain()!)
    await expectReady()
    expect(asks()).toBe(2)
    expect(checkAgain()).toBeNull()

    pressSend()
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'Workshop early access sent',
        }),
      ),
    )
    expect(h.posts).toHaveLength(1)
    expect(h.posts[0]).toMatchObject({
      sponsorForConferenceId: 'sfc-acme',
      kind: 'workshop-early-access',
      recipientKeys: ['c-primary'],
    })
  })

  it('after a send that failed on the network: the old "ready" is not trusted, and "Check again" frees Send', async () => {
    renderModal()
    await expectReady()
    expect(asks()).toBe(1)

    // The network drops: the send fails, and so does the re-ask after it.
    h.down = true
    pressSend()
    expect(await screen.findByRole('alert')).toHaveTextContent(NOT_KNOWN)
    expect(h.posts).toHaveLength(1)
    expect(asks()).toBe(2)
    expect(checkAgain()).toBeVisible()

    h.down = false
    await pressSendThreeTimesInVain()
    expect(h.posts).toHaveLength(1)
    expect(asks()).toBe(2)

    fireEvent.click(checkAgain()!)
    await expectReady()
    expect(asks()).toBe(3)

    h.showNotification.mockClear()
    pressSend()
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' }),
      ),
    )
    expect(h.posts).toHaveLength(2)
  })

  it('"Check again" that fails again leaves the notice and the action in place', async () => {
    h.down = true
    renderModal()
    await screen.findByRole('alert')

    fireEvent.click(checkAgain()!)

    await waitFor(() => expect(asks()).toBe(2))
    expect(await screen.findByRole('alert')).toHaveTextContent(NOT_KNOWN)
    expect(checkAgain()).toBeVisible()
    expect(h.posts).toEqual([])
  })
})
