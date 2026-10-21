import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { delay, http, HttpResponse } from 'msw'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { api } from '@/lib/trpc/client'
import { feedbackTotals } from '@/lib/feedback/totals'
import { TalkFeedbackAdminPanel } from './TalkFeedbackAdminPanel'

const TALK = '/api/trpc/sessionFeedback.adminTalk'
const CODE = '/api/trpc/sessionFeedback.adminCode'

const trpc = (data: unknown) => HttpResponse.json({ result: { data } })
const WINDOW = {
  state: 'before',
  opensAt: '2026-10-27T08:00:00.000Z',
  lastSlotEnd: '2026-10-27T08:40:00.000Z',
  closesAt: '2026-10-28T08:40:00.000Z',
  feedbackVisible: false,
}
/** A fresh response each time: a Response body can be read only once. */
const code = () =>
  trpc({
    code: 'k7m2qx',
    url: 'https://2026.cloudnativedays.no/f/k7m2qx',
    window: WINDOW,
    mayMint: false,
    mayRotate: true,
  })

/** Deterministic dates with real timers (AGENTS.md). */
const runningClockFrom = (start: Date) => () => {
  const realNow = Date.now
  const offset = start.getTime() - realNow()
  Date.now = () => realNow() + offset
  return () => {
    Date.now = realNow
  }
}

const meta = {
  title: 'Systems/Proposals/Session Feedback/TalkFeedbackAdminPanel',
  component: TalkFeedbackAdminPanel,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'What `/admin/proposals/[id]` renders for Session Feedback (speaker feedback spec §10.2): reads `sessionFeedback.adminTalk` and wires the panel’s actions. While that read loads or after it failed, the Feedback Code stands on its own beside the state, so an organizer can still print, mint or rotate. Dark mode follows the global `theme` toolbar (story-level `globals`).',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="w-full max-w-96 p-4">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    talkId: 'talk-1',
    title: 'Kubernetes: the hard parts',
    showCode: true,
  },
  beforeEach: runningClockFrom(new Date('2026-10-17T12:00:00Z')),
} satisfies Meta<typeof TalkFeedbackAdminPanel>

export default meta
type Story = StoryObj<typeof meta>

/** The feedback read is on its way: a skeleton, and the code already. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(TALK, async () => {
          await delay('infinite')
          return trpc(null)
        }),
        http.get(CODE, code),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(
      canvas.getByRole('status', { name: 'Loading Session Feedback' }),
    ).toBeVisible()
    expect(
      await canvas.findByRole('region', { name: 'Feedback Code' }),
    ).toBeVisible()
  },
}

export const LoadingDark: Story = { ...Loading, globals: { theme: 'dark' } }

const talkReads = { n: 0 }

/** The feedback read failed: say so, offer Try again, keep the code. */
export const LoadFailed: Story = {
  beforeEach: () => {
    talkReads.n = 0
  },
  parameters: {
    msw: {
      handlers: [
        http.get(TALK, () => {
          talkReads.n++
          return HttpResponse.json(
            {
              error: {
                message: 'Sanity is down',
                code: -32603,
                data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
              },
            },
            { status: 500 },
          )
        }),
        http.get(CODE, code),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(
      await canvas.findByText('Session Feedback could not be loaded.'),
    ).toHaveAttribute('role', 'alert')
    expect(
      await canvas.findByRole('region', { name: 'Feedback Code' }),
    ).toBeVisible()
    expect(
      await canvas.findByRole('button', { name: 'Rotate Feedback Code' }),
    ).toBeVisible()
    const before = talkReads.n
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(talkReads.n).toBe(before + 1))
  },
}

export const LoadFailedDark: Story = {
  ...LoadFailed,
  globals: { theme: 'dark' },
}

const talkReadsThenFail = { n: 0 }
const TALK_DATA = {
  totals: feedbackTotals({
    live: { green: 23, yellow: 4, red: 2 },
    cards: { greenCount: 12, yellowCount: 3, redCount: 0 },
  }),
  comments: [],
  responses: [],
  window: WINDOW,
  cardsSavedAt: null,
}

/** The page's own refetch, as an action's refresh would run it. */
function WithRefresh(
  args: React.ComponentProps<typeof TalkFeedbackAdminPanel>,
) {
  const utils = api.useUtils()
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void utils.sessionFeedback.adminTalk.invalidate()}
        className="rounded-md border px-2 py-1 text-xs dark:text-white"
      >
        Refresh (as after an action)
      </button>
      <TalkFeedbackAdminPanel {...args} />
    </div>
  )
}

/**
 * The refresh after an action failed: the numbers stay, said to be earlier
 * ones, with Retry, rather than passing for current.
 */
export const RefreshFailed: Story = {
  render: (args) => <WithRefresh {...args} />,
  beforeEach: () => {
    talkReadsThenFail.n = 0
  },
  parameters: {
    msw: {
      handlers: [
        http.get(TALK, () =>
          talkReadsThenFail.n++ === 0
            ? trpc(TALK_DATA)
            : HttpResponse.json(
                {
                  error: {
                    message: 'Sanity is down',
                    code: -32603,
                    data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
                  },
                },
                { status: 500 },
              ),
        ),
        http.get(CODE, code),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('region', { name: 'Session Feedback' })
    await userEvent.click(
      canvas.getByRole('button', { name: 'Refresh (as after an action)' }),
    )
    expect(
      await canvas.findByText('Couldn’t refresh, showing earlier numbers.'),
    ).toBeVisible()
    // The earlier numbers are still there.
    expect(
      canvas.getByRole('region', { name: 'Session Feedback' }),
    ).toBeVisible()
    expect(canvas.getByRole('button', { name: 'Retry' })).toBeVisible()
  },
}

export const RefreshFailedDark: Story = {
  ...RefreshFailed,
  globals: { theme: 'dark' },
}
