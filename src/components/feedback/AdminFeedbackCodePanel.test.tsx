/**
 * @vitest-environment jsdom
 *
 * Rotate's failure path (speaker feedback spec §10.4): whatever went wrong
 * (refused, a release in the way, or a reply lost after the rotation may
 * well have landed), the panel reads the code again, so it never goes on
 * showing a QR that may already be dead.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

const h = vi.hoisted(() => ({
  rotate: null as null | { onError: (error: unknown) => void },
  invalidate: vi.fn(),
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
        useQuery: () => ({ data: undefined, error: null, refetch: vi.fn() }),
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

import { AdminFeedbackCodePanel } from './AdminFeedbackCodePanel'

afterEach(() => {
  cleanup()
  h.invalidate.mockClear()
})

describe('AdminFeedbackCodePanel Rotate', () => {
  it.each([
    ['a lost reply', 'INTERNAL_SERVER_ERROR'],
    ['a refusal', 'NOT_FOUND'],
    ['a release in the way, or a code changed meanwhile', 'CONFLICT'],
  ])('reads the code again after %s', (_, code) => {
    render(<AdminFeedbackCodePanel talkId="talk-1" title="T" />)
    h.rotate!.onError({ data: { code } })
    expect(h.invalidate).toHaveBeenCalledWith({ talkId: 'talk-1' })
  })
})
