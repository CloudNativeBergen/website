/**
 * @vitest-environment jsdom
 *
 * `TalkFeedbackAdminPanel`'s wiring (speaker feedback spec §10.2): its
 * actions refresh both reads that show the responses, this talk's
 * (`adminTalk`) and `/admin/feedback`'s (`adminOverview`); a failed refresh
 * over data already on screen says the numbers are earlier ones; and a
 * Card Counts save hands the panel the save's own stamp. The panel itself
 * is a stub here: these are the container's jobs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TalkFeedbackPanelProps } from './TalkFeedbackPanel'

const h = vi.hoisted(() => ({
  settled: [] as (() => Promise<unknown>)[],
  invalidateTalk: vi.fn(async () => {}),
  invalidateOverview: vi.fn(async () => {}),
  query: {} as Record<string, unknown>,
  refetch: vi.fn(),
  panel: null as null | TalkFeedbackPanelProps,
  cardsReply: null as unknown,
  cardsInput: [] as unknown[],
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
          useQuery: () => ({ ...h.query, refetch: h.refetch }),
        },
        adminHide: mutation,
        adminUnhide: mutation,
        adminRemove: mutation,
      },
      proposal: {
        admin: {
          updateAudienceFeedback: {
            useMutation: (opts: { onSettled: () => Promise<unknown> }) => {
              h.settled.push(opts.onSettled)
              return {
                mutateAsync: async (input: unknown) => {
                  h.cardsInput.push(input)
                  return h.cardsReply
                },
              }
            },
          },
        },
      },
    },
  }
})
vi.mock('./TalkFeedbackPanel', () => ({
  TalkFeedbackPanel: (props: TalkFeedbackPanelProps) => {
    h.panel = props
    return <p>the panel</p>
  },
}))
vi.mock('../AdminFeedbackCodePanel', () => ({
  AdminFeedbackCodePanel: () => null,
}))

import { TalkFeedbackAdminPanel } from './TalkFeedbackAdminPanel'

const DATA = { totals: {}, comments: [], responses: [], window: {} }

beforeEach(() => {
  h.settled = []
  h.panel = null
  h.cardsInput = []
  h.query = { data: DATA, error: null, isError: false, isFetching: false }
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const panel = () =>
  render(<TalkFeedbackAdminPanel talkId="talk-1" title="T" showCode={false} />)

describe('TalkFeedbackAdminPanel', () => {
  it('refreshes this talk and the Session Feedback overview after every action', async () => {
    panel()
    // Hide, Unhide, Remove, Card Counts.
    expect(h.settled).toHaveLength(4)
    for (const settle of h.settled) await settle()
    expect(h.invalidateTalk).toHaveBeenCalledTimes(4)
    expect(h.invalidateTalk).toHaveBeenCalledWith({ talkId: 'talk-1' })
    expect(h.invalidateOverview).toHaveBeenCalledTimes(4)
  })

  it('says the numbers are earlier ones when a refresh fails over data on screen, and retries', () => {
    h.query = { data: DATA, error: { message: 'down' }, isError: true }
    panel()
    expect(screen.getByText('the panel')).toBeTruthy()
    expect(
      screen.getByText('Couldn’t refresh, showing earlier numbers.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(h.refetch).toHaveBeenCalled()
  })

  it('says nothing about refreshing when the read is fine', () => {
    panel()
    expect(screen.queryByText(/Couldn’t refresh/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('hands the panel the time the Card Counts save committed, from its reply', async () => {
    // The patched talk, as the commit returns it.
    h.cardsReply = {
      _id: 'talk-1',
      _updatedAt: '2026-10-27T10:00:02Z',
      audienceFeedback: {
        greenCount: 5,
        yellowCount: 1,
        redCount: 0,
        lastUpdatedAt: '2026-10-27T10:00:01.000Z',
      },
    }
    panel()
    await expect(
      h.panel!.onSaveCards({ green: 5, yellow: 1, red: 0 }),
    ).resolves.toBe('2026-10-27T10:00:02Z')
    expect(h.cardsInput).toEqual([
      {
        id: 'talk-1',
        feedback: { greenCount: 5, yellowCount: 1, redCount: 0 },
      },
    ])
    // A reply without one gives none: the panel falls back to the counts.
    h.cardsReply = { _id: 'talk-1' }
    await expect(
      h.panel!.onSaveCards({ green: 5, yellow: 1, red: 0 }),
    ).resolves.toBeNull()
  })
})
