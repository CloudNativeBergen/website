/**
 * @vitest-environment jsdom
 *
 * Rotate's failure path (speaker feedback spec §10.4): whatever went wrong
 * (refused, a release in the way, or a reply lost after the rotation may
 * well have landed), the panel reads the code again, so it never goes on
 * showing a QR that may already be dead.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({
  rotate: null as null | { onError: (error: unknown) => void },
  invalidate: vi.fn(),
  data: undefined as unknown,
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      sessionFeedback: {
        adminCode: { invalidate: h.invalidate, setData: vi.fn() },
        mintPreview: { invalidate: vi.fn() },
      },
    }),
    sessionFeedback: {
      adminCode: {
        useQuery: () => ({ data: h.data, error: null, refetch: vi.fn() }),
      },
      mintCode: { useMutation: () => ({ mutate: vi.fn() }) },
      rotateCode: {
        useMutation: (opts: { onError: (error: unknown) => void }) => {
          h.rotate = opts
          return { mutate: vi.fn(), reset: vi.fn() }
        },
      },
    },
  },
}))

// The QR and its buttons are not what is tested here.
vi.mock('./FeedbackCodePanel', () => ({ FeedbackCodePanel: () => null }))

import { AdminFeedbackCodePanel } from './AdminFeedbackCodePanel'

afterEach(() => {
  cleanup()
  h.invalidate.mockClear()
  h.data = undefined
})

describe('AdminFeedbackCodePanel Rotate', () => {
  it.each([
    ['a lost reply', 'INTERNAL_SERVER_ERROR'],
    ['a refusal', 'NOT_FOUND'],
    ['a code changed meanwhile', 'CONFLICT'],
    ['a release in the way', 'PRECONDITION_FAILED'],
  ])('reads the code again after %s', (_, code) => {
    render(<AdminFeedbackCodePanel talkId="talk-1" title="T" />)
    h.rotate!.onError({ data: { code } })
    expect(h.invalidate).toHaveBeenCalledWith({ talkId: 'talk-1' })
  })
})

describe('AdminFeedbackCodePanel offers no code once answers are closed (§5, §10.4)', () => {
  // A talk with no slot: answers close when the conference is over.
  const OVER = '2026-11-01T00:00:00.000Z'
  const unscheduled = {
    state: 'unscheduled',
    feedbackVisible: false,
    conferenceOverAt: OVER,
  }

  it.each([
    [
      'Rotate',
      'Rotate Feedback Code',
      {
        code: 'k7m2qx',
        url: 'https://x/f/k7m2qx',
        mayMint: false,
        mayRotate: true,
      },
    ],
    [
      'Mint',
      'Mint Feedback Code',
      { code: null, url: null, mayMint: true, mayRotate: false },
    ],
  ])(
    'takes %s away when the conference ends with the page open',
    (_, name, code) => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date('2026-10-31T23:59:50Z'))
        h.data = { ...code, window: unscheduled }
        render(<AdminFeedbackCodePanel talkId="talk-1" title="T" />)
        act(() => {
          vi.advanceTimersByTime(0)
        })
        expect(screen.getByRole('button', { name })).toBeTruthy()
        act(() => {
          vi.advanceTimersByTime(20_000)
        })
        expect(screen.queryByRole('button', { name })).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    },
  )
})
