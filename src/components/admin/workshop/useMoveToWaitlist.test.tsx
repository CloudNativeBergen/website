/**
 * @vitest-environment jsdom
 *
 * "Move to waitlist" on `/admin/workshops` (#1331) goes through
 * `workshop.admin.batchCancelSignups`, with that one sign-up, and tells the
 * organizer what happened in words that never say cancel. Against the real
 * tRPC client and the real toast provider, with only `fetch` supplied.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api, getTRPCClient } from '@/lib/trpc/client'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { useMoveToWaitlist } from './useMoveToWaitlist'

/** Every mutation posted, in order, with its input. */
const posted: Array<{ procedure: string; input: unknown }> = []
/** What the server answers the next mutation with. */
let answer: () => Response

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify([body]), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const moved = (succeeded: number, failed: number) => () =>
  json({
    result: {
      data: {
        success: true,
        message: 'unused',
        results: { succeeded, failed, total: succeeded + failed },
      },
    },
  })

beforeEach(() => {
  posted.length = 0
  answer = moved(1, 0)
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

function Row({ onMoved }: { onMoved: () => void }) {
  const { moveToWaitlist, isMoving } = useMoveToWaitlist(onMoved)
  return (
    <button
      disabled={isMoving}
      onClick={() => moveToWaitlist('signup-1', 'Ada Lovelace')}
    >
      move
    </button>
  )
}

function press() {
  const onMoved = vi.fn()
  render(
    <Providers>
      <Row onMoved={onMoved} />
    </Providers>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'move' }))
  return { onMoved }
}

describe('useMoveToWaitlist', () => {
  it('moves that one sign-up through batchCancelSignups, then refreshes the lists', async () => {
    const { onMoved } = press()

    await screen.findByText('Moved to waitlist')
    expect(posted).toEqual([
      {
        procedure: 'workshop.admin.batchCancelSignups',
        input: { signupIds: ['signup-1'] },
      },
    ])
    expect(onMoved).toHaveBeenCalledTimes(1)
    expect(
      screen.getByText('Ada Lovelace is on the waitlist. No email was sent.'),
    ).toBeInTheDocument()
  })

  it('does not report a move the server could not make', async () => {
    // The procedure answers "success" for the batch and counts the failures.
    answer = moved(0, 1)
    const { onMoved } = press()

    await screen.findByText('Could not move to waitlist')
    expect(screen.queryByText('Moved to waitlist')).not.toBeInTheDocument()
    // The lists are read again all the same: what they show is what is stored.
    expect(onMoved).toHaveBeenCalledTimes(1)
  })

  it('shows the server’s reason when it refuses', async () => {
    answer = () =>
      json(
        {
          error: {
            message: 'One or more signups do not belong to this conference',
            code: -32004,
            data: { code: 'NOT_FOUND', httpStatus: 404 },
          },
        },
        404,
      )
    const { onMoved } = press()

    await screen.findByText('Could not move to waitlist')
    expect(
      screen.getByText('One or more signups do not belong to this conference'),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'move' })).toBeEnabled(),
    )
    expect(onMoved).not.toHaveBeenCalled()
  })
})
