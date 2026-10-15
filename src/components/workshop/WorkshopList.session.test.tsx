/**
 * @vitest-environment jsdom
 *
 * #1303: the portal's session ended while the page was open (it lasts 7 days
 * with no renewal, or the attendee signed out in another tab). The server
 * refuses the attendee's reads and writes with UNAUTHORIZED, and the list says
 * so, with the way back in: the same GET form to `/workshop/sign-in` the
 * signed-out view uses. Before, the read answered an empty list and the
 * attendee's own workshops were offered as available.
 *
 * Against the real tRPC client and query client, with only `fetch` supplied.
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
import WorkshopList from './WorkshopList'

const WORKSHOP = {
  _id: 'ws-1',
  title: 'Kubernetes 101',
  format: 'workshop_120',
  capacity: 30,
  signups: 12,
  available: 18,
  waitlistCount: 0,
  date: '2026-09-10',
  startTime: '09:00',
  endTime: '11:00',
  room: 'Room A',
  description: 'Hands-on.',
  speakers: [],
  topics: [],
}

const SIGNUP = {
  _id: 'signup-1',
  _type: 'workshopSignup',
  status: 'confirmed',
  workshop: { _type: 'reference', _ref: 'ws-1' },
}

const server = {
  signedIn: true,
  signupReads: 0,
  /** The attendee's sign-ups while signed in. */
  signups: [SIGNUP] as unknown[],
}

const ok = (data: unknown) => ({ result: { data } })

// The procedure's own refusal (`requireWorkshopUser`).
const UNAUTHORIZED: [unknown, number] = [
  {
    error: {
      message: 'You must be signed in to manage workshop signups',
      code: -32001,
      data: { code: 'UNAUTHORIZED', httpStatus: 401 },
    },
  },
  401,
]

function answer(procedure: string): [unknown, number] {
  switch (procedure) {
    case 'workshop.list':
      return [ok({ success: true, data: [WORKSHOP], count: 1 }), 200]
    case 'workshop.getMySignups':
      server.signupReads += 1
      if (!server.signedIn) return UNAUTHORIZED
      return [
        ok({
          success: true,
          data: server.signups,
          count: server.signups.length,
        }),
        200,
      ]
    case 'workshop.announcementsByWorkshop':
      return [ok({ success: true, data: {} }), 200]
    case 'workshop.cancelSignup':
    case 'workshop.signup':
      if (!server.signedIn) return UNAUTHORIZED
      return [ok({ success: true, message: 'cancelled' }), 200]
    default:
      throw new Error(`unexpected procedure ${procedure}`)
  }
}

beforeEach(() => {
  Object.assign(server, { signedIn: true, signupReads: 0, signups: [SIGNUP] })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(String(input), 'http://localhost')
      const answers = decodeURIComponent(pathname.slice('/api/trpc/'.length))
        .split(',')
        .map(answer)
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
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  )
}

function renderPortal() {
  render(
    <Providers>
      <WorkshopList
        userWorkOSId="workos-1"
        userEmail="attendee@example.com"
        userName="Attendee One"
      />
    </Providers>,
  )
}

/** The notice offers a sign-in: a GET form to the portal's sign-in route. */
function expectSignInAgain(notice: HTMLElement) {
  expect(notice).toHaveTextContent(/your session has ended/i)
  const button = within(notice).getByRole('button', { name: 'Sign in again' })
  const form = button.closest('form')
  expect(form).toHaveAttribute('action', '/workshop/sign-in')
  expect(form).toHaveAttribute('method', 'get')
  // Trying the read again cannot help without a session.
  expect(
    within(notice).queryByRole('button', { name: /try again/i }),
  ).toBeNull()
  expect(notice).not.toHaveTextContent(/could not load/i)
}

describe('WorkshopList when the session has ended (#1303)', () => {
  it('asks the attendee to sign in again when the read is refused', async () => {
    server.signedIn = false
    renderPortal()

    expectSignInAgain(await screen.findByRole('alert'))
  })

  // The write opened a dialog (the cancel's question, the sign-up form). Once
  // the session has ended the list shows the notice and nothing else: no
  // dialog, no card with its own copy of the refusal, and none of the
  // registrations the query client still holds from before.
  it.each([
    {
      write: 'cancel',
      signups: [SIGNUP],
      open: 'Cancel Registration',
      dialog: 'Cancel your registration?',
      submit: 'Cancel Registration',
    },
    {
      write: 'sign-up',
      signups: [],
      open: 'Register for Workshop',
      dialog: 'Kubernetes 101',
      submit: 'Confirm Registration',
    },
  ])(
    'asks the same when a $write is refused, and shows nothing else',
    async ({ signups, open, dialog, submit }) => {
      server.signups = signups
      renderPortal()
      // Signed in: the workshop is shown, and no notice.
      const opener = await screen.findByRole('button', { name: open })
      expect(screen.queryByRole('alert')).toBeNull()
      const readsBefore = server.signupReads

      server.signedIn = false
      fireEvent.click(opener)
      const confirm = within(
        await screen.findByRole('dialog', { name: dialog }),
      ).getByRole('button', { name: submit })
      await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'))
      fireEvent.click(confirm)

      await waitFor(() => expect(server.signupReads).toBe(readsBefore + 1))
      expectSignInAgain(await screen.findByRole('alert'))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.queryByText('Kubernetes 101')).toBeNull()
      expect(screen.queryByText(/must be signed in/i)).toBeNull()
    },
  )
})
