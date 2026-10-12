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
const batch = (succeeded: number, failed: number) => () =>
  json({
    result: {
      data: {
        success: true,
        message: 'unused',
        results: { succeeded, failed, total: succeeded + failed },
      },
    },
  })

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

describe('"Move to Confirmed"', () => {
  it('confirms that one sign-up, with the email, and says so', async () => {
    const { onSettled } = press('confirm')

    await vi.waitFor(() => expect(alert).toHaveBeenCalledTimes(1))
    expect(alert).toHaveBeenCalledWith(
      '✅ Ada Lovelace confirmed! Confirmation email sent.',
    )
    expect(posted).toEqual([
      {
        procedure: 'workshop.admin.batchConfirmSignups',
        input: { signupIds: ['signup-1'], sendEmails: true },
      },
    ])
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('does not say "confirmed" when the server could not confirm', async () => {
    answer = batch(0, 1)
    const { onSettled } = press('confirm')

    await screen.findByText('Could not confirm')
    expect(alert).not.toHaveBeenCalled()
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
