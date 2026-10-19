import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { delay, http, HttpResponse } from 'msw'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { feedbackTotals } from '@/lib/feedback/totals'
import { SessionFeedbackSection } from './SessionFeedbackSection'

const ENDPOINT = '/api/trpc/sessionFeedback.ensureCode'
const RESULTS = '/api/trpc/sessionFeedback.results'

const answer = (data: unknown) =>
  http.post(ENDPOINT, () => HttpResponse.json({ result: { data } }))

/** A tRPC error answer, counting how often it was asked. */
const failWith = (code: string, httpStatus: number, hits: { n: number }) =>
  http.post(ENDPOINT, () => {
    hits.n++
    return HttpResponse.json(
      { error: { message: code, code: -32000, data: { code, httpStatus } } },
      { status: httpStatus },
    )
  })

/** Wait for the one ensureCode answer, then for the section to be gone. */
const expectNothingRendered = async (
  canvasElement: HTMLElement,
  hits: { n: number },
) => {
  const canvas = within(canvasElement)
  await waitFor(() => expect(hits.n).toBe(1))
  await waitFor(() =>
    expect(
      canvas.queryByRole('region', { name: 'Session Feedback' }),
    ).toBeNull(),
  )
}

const BEFORE = {
  code: 'k7m2qx',
  url: 'https://2026.cloudnativedays.no/f/k7m2qx',
  window: {
    state: 'before',
    opensAt: '2026-10-29T08:00:00.000Z',
    lastSlotEnd: '2026-10-29T08:40:00.000Z',
    closesAt: '2026-10-30T08:40:00.000Z',
    feedbackVisible: false,
  },
}

/**
 * Deterministic dates with real timers (AGENTS.md: fix relative dates). The
 * section only reads the clock through `Date.now()`, so it starts at a fixed
 * instant and runs at real speed: every story sees the same state on any
 * day, and `OpensWhileShown` still crosses its boundary in real time.
 */
const runningClockFrom = (start: Date) => () => {
  const realNow = Date.now
  const offset = start.getTime() - realNow()
  Date.now = () => realNow() + offset
  return () => {
    Date.now = realNow
  }
}

const meta = {
  title: 'Systems/Proposals/Session Feedback/SessionFeedbackSection',
  component: SessionFeedbackSection,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Full-width section at the top of `/cfp/proposal/[id]` for a confirmed talk (speaker feedback spec §9). Calls `sessionFeedback.ensureCode` on mount, which mints the Feedback Code on first view. Two tabs, **Session Feedback** (from `sessionFeedback.results`, refreshed every 30 s while the window is open) and **Feedback Code**; it opens on the code until feedback is visible, then on the results. A talk with no code shows the results only; a refused talk renders nothing. Dark mode follows the global `theme` toolbar (story-level `globals`).',
      },
    },
    msw: { handlers: [answer(BEFORE)] },
  },
  args: { talkId: 'talk-1', title: 'Kubernetes: the hard parts' },
  beforeEach: runningClockFrom(new Date('2026-10-17T12:00:00Z')),
} satisfies Meta<typeof SessionFeedbackSection>

export default meta
type Story = StoryObj<typeof meta>

export const Loaded: Story = {}

export const LoadedDark: Story = { globals: { theme: 'dark' } }

/** Phone width: the QR stacks above the text (the `sm:flex-row` branch off). */
export const LoadedPhone: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const qr = await canvas.findByRole('img', { name: /QR code for/ })
    const state = canvas.getByText(/Opens when your session starts/)
    // Stacked: the state line starts below the QR, not beside it.
    expect(state.getBoundingClientRect().top).toBeGreaterThan(
      qr.getBoundingClientRect().bottom,
    )
  },
}

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post(ENDPOINT, async () => {
          await delay('infinite')
          return HttpResponse.json({})
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    expect(await within(canvasElement).findByRole('status')).toHaveTextContent(
      'Loading your Feedback Code',
    )
  },
}

const loadFailedHits = { n: 0 }

/** Any other failure keeps the section, says so, and can be retried. */
export const LoadFailed: Story = {
  parameters: {
    msw: { handlers: [failWith('INTERNAL_SERVER_ERROR', 500, loadFailedHits)] },
  },
  beforeEach: () => {
    loadFailedHits.n = 0
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Your Session Feedback could not be loaded.')
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(loadFailedHits.n).toBe(2))
  },
}

const refusedHits = { n: 0 }

/**
 * A missing, foreign, unconfirmed or someone else's talk: the server answers
 * NOT_FOUND for all of them alike, and nothing renders.
 */
export const Refused: Story = {
  parameters: {
    msw: { handlers: [failWith('NOT_FOUND', 404, refusedHits)] },
  },
  beforeEach: () => {
    refusedHits.n = 0
  },
  play: ({ canvasElement }) =>
    expectNothingRendered(canvasElement, refusedHits),
}

/** The story clock starts 2026-10-17T12:00Z; this session ran two days before. */
const CLOSED_WINDOW = {
  state: 'closed',
  opensAt: '2026-10-15T08:00:00.000Z',
  lastSlotEnd: '2026-10-15T08:40:00.000Z',
  closesAt: '2026-10-16T08:40:00.000Z',
  feedbackVisible: true,
}
/** This session ended at 10:40Z today; answers can still arrive. */
const LIVE_WINDOW = {
  state: 'open',
  opensAt: '2026-10-17T10:00:00.000Z',
  lastSlotEnd: '2026-10-17T10:40:00.000Z',
  closesAt: '2026-10-18T10:40:00.000Z',
  feedbackVisible: true,
}

const COMMENTS = [
  {
    id: 'feedbackResponse-1',
    colour: 'green',
    comment: 'The live demo of the scheduler was the best part of the day.',
    submittedAt: '2026-10-15T08:41:00.000Z',
  },
  {
    id: 'feedbackResponse-2',
    colour: 'yellow',
    comment: 'Good content, but the slides were hard to read from the back.',
    submittedAt: '2026-10-15T08:44:00.000Z',
  },
  {
    id: 'feedbackResponse-3',
    colour: 'red',
    comment: 'Too fast for me.',
    submittedAt: '2026-10-15T08:52:00.000Z',
  },
]

const results = (window: unknown, fields: Record<string, unknown> = {}) => ({
  visible: true,
  window,
  totals: feedbackTotals({
    live: { green: 31, yellow: 9, red: 3 },
    cards: { greenCount: 12, yellowCount: 2, redCount: 0 },
  }),
  comments: COMMENTS,
  ...fields,
})

const resultsAnswer = (data: unknown, hits?: { n: number }) =>
  http.get(RESULTS, () => {
    if (hits) hits.n++
    return HttpResponse.json({ result: { data } })
  })

/** After the session: the section opens on the results. */
export const ResultsAfterSession: Story = {
  parameters: {
    msw: {
      handlers: [
        answer({ ...BEFORE, window: CLOSED_WINDOW }),
        resultsAnswer(results(CLOSED_WINDOW)),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(
      await canvas.findByRole('tab', {
        name: 'Session Feedback',
        selected: true,
      }),
    ).toBeVisible()
    expect(await canvas.findByText('57 responses · 3 comments')).toBeVisible()
    // Combined counts: 31 scanned + 12 cards.
    expect(canvas.getByText('43')).toBeVisible()
    expect(canvas.queryByText('Live')).toBeNull()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Scanned vs cards' }),
    )
    expect(canvas.getByText('31 scanned · 12 cards')).toBeVisible()
    // The code is one tab away, its QR kept.
    await userEvent.click(canvas.getByRole('tab', { name: 'Feedback Code' }))
    expect(
      await canvas.findByRole('img', { name: /QR code for/ }),
    ).toBeVisible()
  },
}

export const ResultsAfterSessionDark: Story = {
  ...ResultsAfterSession,
  globals: { theme: 'dark' },
}

export const ResultsAfterSessionPhone: Story = {
  ...ResultsAfterSession,
  parameters: {
    ...ResultsAfterSession.parameters,
    viewport: { defaultViewport: 'mobile1' },
  },
}

export const ResultsAfterSessionPhoneDark: Story = {
  ...ResultsAfterSessionPhone,
  globals: { theme: 'dark' },
}

/** The window is still open: a Live badge. */
export const ResultsLive: Story = {
  parameters: {
    msw: {
      handlers: [
        answer({ ...BEFORE, window: LIVE_WINDOW }),
        resultsAnswer(results(LIVE_WINDOW)),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('Live')).toBeVisible()
  },
}

/** Before the session, the results tab says when feedback appears. */
export const ResultsBeforeSession: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(
      await canvas.findByRole('tab', { name: 'Feedback Code', selected: true }),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('tab', { name: 'Session Feedback' }))
    expect(
      canvas.getByText(
        'Your feedback appears here when your session ends (Thursday 29 October at 09:40).',
      ),
    ).toBeVisible()
  },
}

let flipHits = { n: 0 }

/**
 * The last slot ends 3 s after the code loads, while the speaker is on the
 * Feedback Code tab, maybe showing the QR: the tab stays put, and the
 * results load once the speaker opens their tab.
 */
export const ResultsArriveOnTheClock: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post(ENDPOINT, () => {
          const end = Date.now() + 3000
          return HttpResponse.json({
            result: {
              data: {
                ...BEFORE,
                window: {
                  state: 'open',
                  opensAt: new Date(end - 40 * 60_000).toISOString(),
                  lastSlotEnd: new Date(end).toISOString(),
                  closesAt: new Date(end + 24 * 3_600_000).toISOString(),
                  feedbackVisible: false,
                },
              },
            },
          })
        }),
        http.get(RESULTS, () => {
          flipHits.n++
          return HttpResponse.json({ result: { data: results(LIVE_WINDOW) } })
        }),
      ],
    },
  },
  beforeEach: () => {
    flipHits = { n: 0 }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const codeTab = await canvas.findByRole('tab', {
      name: 'Feedback Code',
      selected: true,
    })
    await canvas.findByRole('img', { name: /QR code for/ })
    // After the slot's end the results load, but the tab does not move.
    await waitFor(() => expect(flipHits.n).toBe(1), { timeout: 10000 })
    expect(codeTab).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(canvas.getByRole('tab', { name: 'Session Feedback' }))
    expect(await canvas.findByText('57 responses · 3 comments')).toBeVisible()
  },
}

const resultsFailedHits = { n: 0 }

/** The results fail to load: the tab says so and can be retried. */
export const ResultsLoadFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        answer({ ...BEFORE, window: CLOSED_WINDOW }),
        http.get(RESULTS, () => {
          resultsFailedHits.n++
          return HttpResponse.json(
            {
              error: {
                message: 'x',
                code: -32603,
                data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
              },
            },
            { status: 500 },
          )
        }),
      ],
    },
  },
  beforeEach: () => {
    resultsFailedHits.n = 0
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText(
      'Your Session Feedback could not be loaded.',
      {},
      {
        timeout: 10000,
      },
    )
    const before = resultsFailedHits.n
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(resultsFailedHits.n).toBeGreaterThan(before))
  },
}

/**
 * A talk the server gives no code because its window closed before it ever
 * had one, like every talk of an edition that ended before launch (§9.5):
 * the results only, no code tab.
 */
export const ResultsOnly: Story = {
  parameters: {
    msw: {
      handlers: [
        answer({ code: null, url: null, window: CLOSED_WINDOW }),
        resultsAnswer(
          results(CLOSED_WINDOW, {
            totals: feedbackTotals({
              live: { green: 0, yellow: 0, red: 0 },
              cards: { greenCount: 42, yellowCount: 15, redCount: 3 },
            }),
            comments: [],
          }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('60 responses · 0 comments')).toBeVisible()
    expect(canvas.queryByRole('tab')).toBeNull()
    expect(canvas.getByText('No comments yet.')).toBeVisible()
  },
}

export const ResultsOnlyDark: Story = {
  ...ResultsOnly,
  globals: { theme: 'dark' },
}

let opensWhileShownRequests = 0

/**
 * The page is left up for the room: the session starts 5 s after the code
 * loads. The hook's timer runs on real time, so the story does too; the
 * margin is room for a busy CI runner to see "Opens…" and the QR first, and
 * the test fails loudly if it did not. The state moves on by the clock, the QR stays on screen, and the
 * server is not asked again.
 */
export const OpensWhileShown: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post(ENDPOINT, () => {
          opensWhileShownRequests++
          const opensAt = Date.now() + 5000
          return HttpResponse.json({
            result: {
              data: {
                ...BEFORE,
                window: {
                  state: 'before',
                  opensAt: new Date(opensAt).toISOString(),
                  lastSlotEnd: new Date(opensAt + 40 * 60_000).toISOString(),
                  closesAt: new Date(opensAt + 25 * 3_600_000).toISOString(),
                  feedbackVisible: false,
                },
              },
            },
          })
        }),
      ],
    },
  },
  beforeEach: () => {
    opensWhileShownRequests = 0
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText(/Opens when your session starts/)
    const qr = await canvas.findByRole('img', { name: /QR code for/ })
    // The QR was captured BEFORE the boundary, or continuity proves nothing.
    expect(canvas.getByText(/Opens when your session starts/)).toBeVisible()
    await waitFor(() => canvas.getByText(/Open until/), { timeout: 10000 })
    // The same QR, never blanked or redrawn, and no second request.
    expect(canvas.getByRole('img', { name: /QR code for/ })).toBe(qr)
    expect(opensWhileShownRequests).toBe(1)
  },
}

/**
 * The laptop slept through the session start: timers do not run while it
 * sleeps, so coming back to the tab must re-read the clock.
 */
export const WakesAfterSleep: Story = {
  parameters: {
    msw: {
      handlers: [
        answer(BEFORE),
        // next-auth's SessionProvider refetches the session on
        // visibilitychange too; answer it so the run stays quiet.
        http.get('/api/auth/session', () => HttpResponse.json({})),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const settle = () => new Promise((resolve) => setTimeout(resolve, 300))
    await canvas.findByText(/Opens when your session starts/)
    // Let the first clock tick run, so only the wake can move the state.
    await settle()
    const realNow = Date.now
    Date.now = () => Date.parse(BEFORE.window.opensAt) + 60_000
    try {
      await settle()
      // The clock has passed the start, but nothing re-read it yet.
      expect(canvas.getByText(/Opens when your session starts/)).toBeVisible()
      document.dispatchEvent(new Event('visibilitychange'))
      expect(await canvas.findByText(/Open until/)).toBeVisible()
    } finally {
      Date.now = realNow
    }
  },
}
