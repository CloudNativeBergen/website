import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { delay, http, HttpResponse } from 'msw'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { SessionFeedbackSection } from './SessionFeedbackSection'

const ENDPOINT = '/api/trpc/sessionFeedback.ensureCode'

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
          'Full-width section at the top of `/cfp/proposal/[id]` for a confirmed talk. Calls `sessionFeedback.ensureCode` on mount, which mints the Feedback Code on first view. Renders nothing when the server refuses the talk or will not mint a code. Dark mode follows the global `theme` toolbar (story-level `globals`).',
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
    await canvas.findByText('Your Feedback Code could not be loaded.')
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

const noCodeHits = { n: 0 }

/** A talk whose window closed before it ever had a code: nothing renders. */
export const NoCode: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post(ENDPOINT, () => {
          noCodeHits.n++
          return HttpResponse.json({
            result: {
              data: {
                code: null,
                url: null,
                window: { ...BEFORE.window, state: 'closed' },
              },
            },
          })
        }),
      ],
    },
  },
  beforeEach: () => {
    noCodeHits.n = 0
  },
  play: ({ canvasElement }) => expectNothingRendered(canvasElement, noCodeHits),
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
