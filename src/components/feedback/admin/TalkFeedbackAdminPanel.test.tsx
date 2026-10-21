/**
 * @vitest-environment jsdom
 *
 * The talk panel's actions refresh both reads that show the responses: this
 * talk's (`adminTalk`) and `/admin/feedback`'s (`adminOverview`), so going
 * back there never shows what was just hidden, removed or recounted here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

const h = vi.hoisted(() => ({
  settled: [] as (() => Promise<unknown>)[],
  invalidateTalk: vi.fn(async () => {}),
  invalidateOverview: vi.fn(async () => {}),
}))

vi.mock('@/lib/trpc/client', () => {
  const mutation = {
    useMutation: (opts: { onSettled: () => Promise<unknown> }) => {
      h.settled.push(opts.onSettled)
      return { mutateAsync: vi.fn() }
    },
  }
  return {
    api: {
      useUtils: () => ({
        sessionFeedback: {
          adminTalk: { invalidate: h.invalidateTalk },
          adminOverview: { invalidate: h.invalidateOverview },
        },
      }),
      sessionFeedback: {
        adminTalk: {
          useQuery: () => ({ data: undefined, error: null, refetch: vi.fn() }),
        },
        adminHide: mutation,
        adminUnhide: mutation,
        adminRemove: mutation,
        adminRemoveRange: mutation,
      },
      proposal: { admin: { updateAudienceFeedback: mutation } },
    },
  }
})

import { TalkFeedbackAdminPanel } from './TalkFeedbackAdminPanel'

afterEach(cleanup)

describe('TalkFeedbackAdminPanel', () => {
  it('refreshes this talk and the Session Feedback overview after every action', async () => {
    render(
      <TalkFeedbackAdminPanel talkId="talk-1" title="T" showCode={false} />,
    )
    // Hide, Unhide, Remove, Remove a range, Card Counts.
    expect(h.settled).toHaveLength(5)
    for (const settle of h.settled) await settle()
    expect(h.invalidateTalk).toHaveBeenCalledTimes(5)
    expect(h.invalidateTalk).toHaveBeenCalledWith({ talkId: 'talk-1' })
    expect(h.invalidateOverview).toHaveBeenCalledTimes(5)
  })
})
