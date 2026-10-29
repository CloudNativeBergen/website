/**
 * @vitest-environment jsdom
 *
 * The three actions on one sign-up in the list on `/admin/workshops`: "Move to
 * Confirmed", "Move to waitlist" (#1331) and delete. Against the real tRPC
 * client and the real toast provider, with only `fetch` supplied.
 *
 * Since #1331 an attendee's cancel DELETES the sign-up, so an organizer acting
 * on a row the attendee has just cancelled is an ordinary case: the server
 * answers NOT_FOUND. Each action then says so and reads the lists again. Before,
 * two of the three failed without a word and the row stayed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api, getTRPCClient } from '@/lib/trpc/client'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { useSignupActions } from './useSignupActions'

/** Every mutation posted, in order, with its input. */
const posted: Array<{ procedure: string; input: unknown }> = []
/** What the server answers the next mutation with. */
let answer: () => Response
const alert = vi.fn()

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify([body]), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/** A batch procedure's answer: "success" for the batch, with what failed counted. */
const batch =
  (
    succeeded: number,
    failed: number,
    beyondCapacity: {
      workshopTitle: string
      seatsTaken: number
      capacity: number
    }[] = [],
    full: {
      workshopId: string
      workshopTitle: string
      seatsTaken: number
      capacity: number
      after: number
      signupIds: string[]
    }[] = [],
  ) =>
  () =>
    json({
      result: {
        data: {
          success: true,
          message: 'unused',
          results: {
            succeeded,
            failed,
            total: succeeded + failed,
            beyondCapacity,
            full,
          },
        },
      },
    })

/** The server's refusal of a confirm into a full workshop (#1358). */
const fullAt = (seatsTaken: number, capacity: number) =>
  batch(
    0,
    1,
    [],
    [
      {
        workshopId: 'ws-1',
        workshopTitle: 'Kubernetes 101',
        seatsTaken,
        capacity,
        after: seatsTaken + 1,
        signupIds: ['signup-1'],
      },
    ],
  )

const refusal = (code: string, httpStatus: number, message: string) => () =>
  json(
    { error: { message, code: -32000, data: { code, httpStatus } } },
    httpStatus,
  )

/** What the server says when the attendee has cancelled: the sign-up is gone. */
const gone = refusal(
  'NOT_FOUND',
  404,
  'One or more signups do not belong to this conference',
)
const GONE_TEXT =
  "Ada Lovelace's sign-up was not found. They may have cancelled it."

beforeEach(() => {
  posted.length = 0
  alert.mockClear()
  answer = batch(1, 0)
  vi.stubGlobal('alert', alert)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      posted.push({
        procedure: url.pathname.slice('/api/trpc/'.length),
        input: JSON.parse(String(init?.body))[0],
      })
      return answer()
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [trpcClient] = useState(() => getTRPCClient())
  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>{children}</NotificationProvider>
      </QueryClientProvider>
    </api.Provider>
  )
}

function Row({ onSettled }: { onSettled: () => void }) {
  const actions = useSignupActions(onSettled)
  return (
    <>
      <button
        onClick={() => actions.moveToWaitlist('signup-1', 'Ada Lovelace')}
      >
        move
      </button>
      <button onClick={() => actions.confirm('signup-1', 'Ada Lovelace')}>
        confirm
      </button>
      <button onClick={() => actions.remove('signup-1', 'Ada Lovelace')}>
        delete
      </button>
      <button onClick={() => actions.confirmBeyondCapacity()}>
        beyond capacity
      </button>
      <button onClick={() => actions.dismissFull()}>dismiss</button>
      {actions.full && (
        <p>
          full: {actions.full.workshopTitle} {actions.full.seatsTaken} of{' '}
          {actions.full.capacity}, after {actions.full.after}
          {actions.full.changed ? ', changed' : ''}
        </p>
      )}
      <output>
        {[
          actions.isMoving && 'moving',
          actions.isConfirming && 'confirming',
          actions.isDeleting && 'deleting',
        ]
          .filter(Boolean)
          .join(' ')}
      </output>
    </>
  )
}

function press(name: 'move' | 'confirm' | 'delete') {
  const onSettled = vi.fn()
  render(
    <Providers>
      <Row onSettled={onSettled} />
    </Providers>,
  )
  fireEvent.click(screen.getByRole('button', { name }))
  return { onSettled }
}

describe('"Move to waitlist"', () => {
  it('moves that one sign-up through batchCancelSignups, then reads the lists again', async () => {
    const { onSettled } = press('move')

    await screen.findByText('Moved to waitlist')
    expect(posted).toEqual([
      {
        procedure: 'workshop.admin.batchCancelSignups',
        input: { signupIds: ['signup-1'] },
      },
    ])
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(
      screen.getByText('Ada Lovelace is on the waitlist. No email was sent.'),
    ).toBeInTheDocument()
  })

  it('does not report a move the server could not make', async () => {
    // The procedure answers "success" for the batch and counts the failures.
    answer = batch(0, 1)
    const { onSettled } = press('move')

    await screen.findByText('Could not move to waitlist')
    expect(screen.queryByText('Moved to waitlist')).not.toBeInTheDocument()
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('says the sign-up was not found, and reads the lists again, when the attendee has cancelled it', async () => {
    answer = gone
    const { onSettled } = press('move')

    await screen.findByText('Could not move to waitlist')
    expect(screen.getByText(GONE_TEXT)).toBeInTheDocument()
    // Without this the row stays in the list and every retry fails the same way.
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('shows the server’s own reason for any other refusal', async () => {
    answer = refusal('FORBIDDEN', 403, 'Workshops are not enabled')
    const { onSettled } = press('move')

    await screen.findByText('Could not move to waitlist')
    expect(screen.getByText('Workshops are not enabled')).toBeInTheDocument()
    expect(screen.queryByText(GONE_TEXT)).not.toBeInTheDocument()
    expect(onSettled).toHaveBeenCalledTimes(1)
  })
})

describe('a request that got no answer', () => {
  const NO_ANSWER =
    "Ada Lovelace's sign-up may or may not have been changed. Check the list before trying again."

  it.each(['move', 'confirm', 'delete'] as const)(
    '%s: says the server was not reached and that the change may have gone through',
    async (action) => {
      // What the browser gives when the connection drops: no response at all.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new TypeError('Failed to fetch')
        }),
      )
      const { onSettled } = press(action)

      await screen.findByText('No answer from the server')
      expect(screen.getByText(NO_ANSWER)).toBeInTheDocument()
      // It is not known to have failed, and the browser's own words say
      // nothing an organizer can act on.
      expect(screen.queryByText(/^Could not/)).not.toBeInTheDocument()
      expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument()
      expect(alert).not.toHaveBeenCalled()
      expect(onSettled).toHaveBeenCalledTimes(1)
    },
  )
})

describe('"Move to Confirmed"', () => {
  it('confirms that one sign-up, with the email, and says so', async () => {
    const { onSettled } = press('confirm')

    await screen.findByText('Ada Lovelace confirmed')
    expect(screen.getByText('Confirmation email sent.')).toBeInTheDocument()
    expect(posted).toEqual([
      {
        procedure: 'workshop.admin.batchConfirmSignups',
        input: { signupIds: ['signup-1'], sendEmails: true },
      },
    ])
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('says so when the confirm went beyond capacity (#1344)', async () => {
    answer = batch(1, 0, [
      { workshopTitle: 'Kubernetes 101', seatsTaken: 31, capacity: 30 },
    ])
    press('confirm')

    await screen.findByText('Ada Lovelace confirmed')
    expect(
      screen.getByText(
        'Confirmed beyond capacity (31 of 30 seats). Confirmation email sent.',
      ),
    ).toBeInTheDocument()
  })

  it('does not say "confirmed" when the server could not confirm', async () => {
    answer = batch(0, 1)
    const { onSettled } = press('confirm')

    await screen.findByText('Could not confirm')
    expect(screen.queryByText('Ada Lovelace confirmed')).not.toBeInTheDocument()
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('says the sign-up was not found, and reads the lists again, when the attendee has cancelled it', async () => {
    answer = gone
    const { onSettled } = press('confirm')

    await screen.findByText('Could not confirm')
    expect(screen.getByText(GONE_TEXT)).toBeInTheDocument()
    expect(alert).not.toHaveBeenCalled()
    expect(onSettled).toHaveBeenCalledTimes(1)
  })
})

describe('"Move to Confirmed" into a full workshop (#1358)', () => {
  const FULL = 'full: Kubernetes 101 30 of 30, after 31'

  it('is refused and asked: no "confirmed", no "could not", the numbers shown, and the lists read again', async () => {
    answer = fullAt(30, 30)
    const { onSettled } = press('confirm')

    expect(await screen.findByText(FULL)).toBeInTheDocument()
    expect(alert).not.toHaveBeenCalled()
    expect(screen.queryByText('Could not confirm')).not.toBeInTheDocument()
    // The posted confirm carries no accepted overshoot: the organizer has
    // not agreed to anything yet.
    expect(posted[0].input).toEqual({
      signupIds: ['signup-1'],
      sendEmails: true,
    })
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('"Confirm beyond capacity" sends the confirm again with the overshoot shown, and says it went past capacity', async () => {
    answer = fullAt(30, 30)
    press('confirm')
    await screen.findByText(FULL)

    answer = batch(1, 0, [
      { workshopTitle: 'Kubernetes 101', seatsTaken: 31, capacity: 30 },
    ])
    fireEvent.click(screen.getByRole('button', { name: 'beyond capacity' }))

    await screen.findByText('Ada Lovelace confirmed')
    expect(
      screen.getByText(
        'Confirmed beyond capacity (31 of 30 seats). Confirmation email sent.',
      ),
    ).toBeInTheDocument()
    expect(posted[1]).toEqual({
      procedure: 'workshop.admin.batchConfirmSignups',
      input: {
        signupIds: ['signup-1'],
        sendEmails: true,
        acceptPast: { 'ws-1': 1 },
      },
    })
    expect(screen.queryByText(/^full:/)).not.toBeInTheDocument()
  })

  it('an override refused again (a seat changed hands meanwhile) shows the new numbers and says they changed', async () => {
    answer = fullAt(30, 30)
    press('confirm')
    await screen.findByText(FULL)

    answer = fullAt(31, 30)
    fireEvent.click(screen.getByRole('button', { name: 'beyond capacity' }))

    expect(
      await screen.findByText(
        'full: Kubernetes 101 31 of 30, after 32, changed',
      ),
    ).toBeInTheDocument()
    expect(alert).not.toHaveBeenCalled()
  })

  it('a refusal that arrives after the question was dismissed (the list closed) is a toast, not a question for the next list', async () => {
    let release: (response: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (release = resolve))),
    )
    press('confirm')
    // The request is on its way (tRPC posts after a tick), the list closes.
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'dismiss' }))
    release(fullAt(30, 30)())

    await screen.findByText('Ada Lovelace was not confirmed')
    expect(
      screen.getByText(
        'Kubernetes 101 is full (30 of 30 seats). Confirm again to go beyond capacity.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^full:/)).not.toBeInTheDocument()
    expect(alert).not.toHaveBeenCalled()
  })

  it('dismissing keeps the sign-up on the waitlist: nothing more is posted', async () => {
    answer = fullAt(30, 30)
    press('confirm')
    await screen.findByText(FULL)

    fireEvent.click(screen.getByRole('button', { name: 'dismiss' }))

    expect(screen.queryByText(/^full:/)).not.toBeInTheDocument()
    expect(posted).toHaveLength(1)
    expect(alert).not.toHaveBeenCalled()
  })
})

describe('delete', () => {
  it('deletes that one sign-up, then reads the lists again', async () => {
    answer = () =>
      json({ result: { data: { success: true, message: 'unused' } } })
    const { onSettled } = press('delete')

    await vi.waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1))
    expect(posted).toEqual([
      {
        procedure: 'workshop.admin.deleteSignup',
        input: { signupId: 'signup-1' },
      },
    ])
    expect(screen.queryByText('Could not delete')).not.toBeInTheDocument()
  })

  it('says the sign-up was not found, and reads the lists again, when the attendee has cancelled it', async () => {
    answer = refusal('NOT_FOUND', 404, 'Not found')
    const { onSettled } = press('delete')

    await screen.findByText('Could not delete')
    expect(screen.getByText(GONE_TEXT)).toBeInTheDocument()
    expect(onSettled).toHaveBeenCalledTimes(1)
  })
})

describe('while an action is on its way', () => {
  it('reports which one, so the list can switch its buttons off', async () => {
    let release: (response: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (release = resolve))),
    )
    press('move')

    expect(await screen.findByText('moving')).toBeInTheDocument()
    release(batch(1, 0)())
    await screen.findByText('Moved to waitlist')
    expect(screen.queryByText('moving')).not.toBeInTheDocument()
  })
})
