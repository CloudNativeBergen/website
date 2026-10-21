import { useEffect, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import type {
  AdminFeedbackComment,
  AdminTalkFeedback,
} from '@/lib/feedback/admin'
import type { ChartResponse } from '@/lib/feedback/buckets'
import type { FeedbackColour } from '@/lib/feedback/colour'
import { feedbackTotals } from '@/lib/feedback/totals'
import { AdminFeedbackCodePanel } from '../AdminFeedbackCodePanel'
import { TalkFeedbackPanel } from './TalkFeedbackPanel'

const id = (n: number) => `feedbackResponse-${String(n).padStart(32, '0')}`
const at = (hhmm: string) => `2026-10-27T${hhmm}:00.000Z`

/**
 * A 09:00–09:40 Oslo session on 2026-10-27 (08:00–08:40Z), its window open
 * until 24 hours later. A steady trickle of answers during and after the
 * talk, then a scripted burst of 40 red ones at 09:51–09:58Z.
 */
const TRICKLE: [string, FeedbackColour][] = [
  ['08:12', 'green'],
  ['08:26', 'green'],
  ['08:33', 'yellow'],
  ['08:41', 'green'],
  ['08:41', 'green'],
  ['08:42', 'green'],
  ['08:43', 'yellow'],
  ['08:44', 'green'],
  ['08:46', 'green'],
  ['08:48', 'green'],
  ['08:52', 'red'],
  ['08:55', 'green'],
  ['09:03', 'green'],
  ['09:17', 'yellow'],
  ['09:24', 'green'],
]
const BURST: [string, FeedbackColour][] = Array.from({ length: 40 }, (_, i) => [
  `09:5${1 + Math.floor(i / 6)}`,
  'red',
])
const RESPONSES: ChartResponse[] = [...TRICKLE, ...BURST].map(
  ([hhmm, colour], i) => ({ id: id(i + 1), colour, submittedAt: at(hhmm) }),
)
const BURST_IDS = RESPONSES.slice(TRICKLE.length).map((r) => r.id)

const comment = (
  n: number,
  text: string,
  fields: Partial<AdminFeedbackComment> = {},
): AdminFeedbackComment => ({
  id: id(n),
  colour: RESPONSES[n - 1].colour,
  comment: text,
  submittedAt: RESPONSES[n - 1].submittedAt,
  hidden: false,
  flagged: false,
  ...fields,
})

const count = (colour: FeedbackColour) =>
  RESPONSES.filter((r) => r.colour === colour).length

const FEEDBACK: AdminTalkFeedback = {
  totals: feedbackTotals({
    live: { green: count('green'), yellow: count('yellow'), red: count('red') },
    cards: { greenCount: 12, yellowCount: 3, redCount: 0 },
  }),
  comments: [
    comment(1, 'Best talk of the day. The live demo actually worked!'),
    comment(3, 'Good content, a bit too fast in the second half.', {
      flagged: true,
    }),
    comment(11, 'The speaker is an idiot and so is everyone who liked this.', {
      hidden: true,
    }),
    comment(16, 'spam spam spam buy followers now'),
  ],
  responses: RESPONSES,
  window: {
    state: 'open',
    opensAt: '2026-10-27T08:00:00.000Z',
    lastSlotEnd: '2026-10-27T08:40:00.000Z',
    closesAt: '2026-10-28T08:40:00.000Z',
    feedbackVisible: true,
  },
}

/** After the window closed: the chart spans all 24 h 40 min of it. */
const CLOSED: AdminTalkFeedback = {
  ...FEEDBACK,
  window: { ...FEEDBACK.window, state: 'closed' },
}

const CODE = {
  code: 'k7m2qx',
  url: 'https://2026.cloudnativedays.no/f/k7m2qx',
  window: FEEDBACK.window,
  mayMint: false,
  mayRotate: true,
}

/**
 * Deterministic dates with real timers (AGENTS.md): the clock starts at
 * 10:30Z on the session's day, inside the window, and runs at real speed.
 */
const runningClockFrom = (start: Date) => () => {
  const realNow = Date.now
  const offset = start.getTime() - realNow()
  Date.now = () => realNow() + offset
  return () => {
    Date.now = realNow
  }
}

/**
 * The confirmations are portaled out of the story's root, past the global
 * theme decorator's `dark` wrapper; put `dark` on the document too.
 */
function DocumentTheme({
  dark,
  children,
}: {
  dark: boolean
  children: ReactNode
}) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])
  return children
}

/**
 * Press the confirmation's button once its second-tap guard has passed (it
 * says `aria-disabled` until then, and ignores the press).
 */
async function confirmWith(name: string) {
  const dialog = await screen.findByRole('dialog')
  const button = within(dialog).getByRole('button', { name })
  await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
  await userEvent.click(button)
}

const meta = {
  title: 'Systems/Proposals/Session Feedback/TalkFeedbackPanel',
  component: TalkFeedbackPanel,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A talk’s Session Feedback in the sidebar of `/admin/proposals/[id]` (speaker feedback spec §10.2), replacing the old Card Counts panel: totals split into scanned and Card Counts (editable in place, saved through `proposal.updateAudienceFeedback`), the Feedback Code with Mint and Rotate (§10.4), responses over time in 10-minute buckets with Remove by range, and the comments with Hide, Unhide and Remove (§10.3). Dark mode follows the global `theme` toolbar (story-level `globals`), applied to the document as well because the confirmations are portaled.',
      },
    },
    msw: {
      handlers: [
        http.get('/api/trpc/sessionFeedback.adminCode', () =>
          HttpResponse.json({ result: { data: CODE } }),
        ),
      ],
    },
  },
  // The admin talk page's sidebar is 24rem wide (`lg:w-96`) with p-4; on a
  // phone it is the full width.
  decorators: [
    (Story, context) => (
      <DocumentTheme dark={context.globals.theme === 'dark'}>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <div className="w-full max-w-96 p-4">
            <Story />
          </div>
        </div>
      </DocumentTheme>
    ),
  ],
  args: {
    feedback: FEEDBACK,
    code: (
      <AdminFeedbackCodePanel talkId="talk-1" title="Kubernetes" embedded />
    ),
    onSaveCards: fn(async () => {}),
    onHide: fn(async () => {}),
    onUnhide: fn(async () => {}),
    onRemove: fn(async () => {}),
    onRemoveRange: fn(async (ids: string[]) => ({
      removed: ids.length,
      gone: 0,
    })),
  },
  beforeEach: runningClockFrom(new Date('2026-10-27T10:30:00Z')),
} satisfies Meta<typeof TalkFeedbackPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const DefaultDark: Story = { globals: { theme: 'dark' } }

/** After the window closed: 148 buckets in the sidebar's width. */
export const WindowClosed: Story = { args: { feedback: CLOSED } }

export const NoResponsesYet: Story = {
  args: {
    feedback: {
      ...FEEDBACK,
      totals: feedbackTotals({ live: {} }),
      comments: [],
      responses: [],
    },
  },
}

/** A talk from before scanning: Card Counts only, no code section. */
export const CardCountsOnly: Story = {
  args: {
    code: undefined,
    feedback: {
      totals: feedbackTotals({
        live: {},
        cards: { greenCount: 41, yellowCount: 9, redCount: 2 },
      }),
      comments: [],
      responses: [],
      window: { state: 'closed', feedbackVisible: true },
    },
  },
}

/**
 * The burst, picked by keyboard: Home, then Shift+End selects everything;
 * arrows narrow it to the burst's buckets. Remove asks with the count and
 * removes exactly the ids that were shown.
 */
export const RemovesARangeByKeyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const chart = canvas.getByRole('listbox', { name: 'Responses over time' })
    chart.focus()
    // 08:00–10:30 is 16 buckets; the burst is in the 09:50 one (index 11).
    await userEvent.keyboard('{End}')
    for (let i = 0; i < 4; i++) await userEvent.keyboard('{ArrowLeft}')
    // Now on 09:50. Shift+ArrowRight reaches 10:00, which is empty.
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    const options = within(chart).getAllByRole('option')
    expect(options).toHaveLength(16)
    expect(
      options.filter((o) => o.getAttribute('aria-selected') === 'true'),
    ).toHaveLength(2)
    expect(
      canvas.getByText(/Tue 27 Oct, 10:50–11:10 · 40 responses/),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove these 40' }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Remove 40 responses?')).toBeInTheDocument()
    await confirmWith('Remove')
    await waitFor(() => expect(args.onRemoveRange).toHaveBeenCalledTimes(1))
    expect(args.onRemoveRange).toHaveBeenCalledWith(BURST_IDS)
    expect(await canvas.findByText('40 responses removed.')).toBeVisible()
  },
}

/** A range picked by dragging across the bars (pointer or touch). */
export const RemovesARangeByDragging: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const chart = canvas.getByRole('listbox', { name: 'Responses over time' })
    const box = chart.getBoundingClientRect()
    const x = (bucket: number) => box.left + ((bucket + 0.5) / 16) * box.width
    const y = box.top + box.height / 2
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: chart, coords: { x: x(4), y } },
      { target: chart, coords: { x: x(5), y } },
      { keys: '[/MouseLeft]', target: chart, coords: { x: x(5), y } },
    ])
    // 08:40–09:00Z: nine answers just after the session.
    expect(
      canvas.getByText(/Tue 27 Oct, 09:40–10:00 · 9 responses/),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove these 9' }),
    )
    await confirmWith('Remove')
    await waitFor(() =>
      expect(args.onRemoveRange).toHaveBeenCalledWith(
        RESPONSES.slice(3, 12).map((r) => r.id),
      ),
    )
  },
}

/** The confirmation, open, for a visual check. */
export const RemoveAsks: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    canvas.getByRole('listbox', { name: 'Responses over time' }).focus()
    await userEvent.keyboard(
      '{End}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}',
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove these 40' }),
    )
    expect(await screen.findByRole('dialog')).toBeVisible()
  },
}

export const RemoveAsksDark: Story = {
  ...RemoveAsks,
  globals: { theme: 'dark' },
}

/** A range picked, waiting for Remove: phone and desktop captures. */
export const RangeSelected: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    canvas.getByRole('listbox', { name: 'Responses over time' }).focus()
    await userEvent.keyboard(
      '{End}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{Shift>}{ArrowRight}{/Shift}',
    )
    expect(
      canvas.getByRole('button', { name: 'Remove these 40' }),
    ).toBeVisible()
  },
}

export const RangeSelectedDark: Story = {
  ...RangeSelected,
  globals: { theme: 'dark' },
}

/** A failed Remove says what happened where the organizer is working. */
export const RemoveFailed: Story = {
  args: {
    onRemoveRange: fn<
      (ids: string[]) => Promise<{ removed: number; gone: number }>
    >(async () => {
      throw new Error(
        'Not all 2400 responses were removed (at least 2000 were). Reload to see what’s left, then remove those.',
      )
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    canvas.getByRole('listbox', { name: 'Responses over time' }).focus()
    await userEvent.keyboard(
      '{End}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}',
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove these 40' }),
    )
    await confirmWith('Remove')
    expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Not all 2400 responses were removed (at least 2000 were).',
    )
  },
}

/** Card Counts are edited where they stand and saved as numbers. */
export const EditsCardCounts: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const green = canvas.getByRole('textbox', { name: 'Loved it cards' })
    const red = canvas.getByRole('textbox', { name: 'Not for me cards' })
    await userEvent.clear(green)
    await userEvent.type(green, '14')
    await userEvent.clear(red)
    await userEvent.type(red, '1')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Save Card Counts' }),
    )
    await waitFor(() =>
      expect(args.onSaveCards).toHaveBeenCalledWith({
        green: 14,
        yellow: 3,
        red: 1,
      }),
    )
    expect(await canvas.findByText('Card Counts saved.')).toBeVisible()
  },
}

/** A count that is not a whole number cannot be saved. */
export const CardCountInvalid: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const yellow = canvas.getByRole('textbox', { name: 'It was OK cards' })
    await userEvent.clear(yellow)
    await userEvent.type(yellow, '-2')
    expect(
      canvas.getByRole('button', { name: 'Save Card Counts' }),
    ).toBeDisabled()
    expect(
      canvas.getByText('Card Counts are whole numbers, 0 or more.'),
    ).toBeVisible()
    await userEvent.keyboard('{Enter}')
    expect(args.onSaveCards).not.toHaveBeenCalled()
  },
}

export const CardCountInvalidDark: Story = {
  ...CardCountInvalid,
  globals: { theme: 'dark' },
}

/** Hide on a comment goes through the shared comment row. */
export const HidesAComment: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const comments = within(canvas.getByRole('region', { name: 'Comments' }))
    await userEvent.click(comments.getAllByRole('button', { name: 'Hide' })[0])
    await waitFor(() => expect(args.onHide).toHaveBeenCalledWith(id(1)))
    expect(
      await comments.findByText('Comment hidden from speakers.', {
        selector: 'p:not([role])',
      }),
    ).toBeVisible()
  },
}
