import { useEffect, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { feedbackTotals } from '@/lib/feedback/totals'
import type {
  AdminFeedbackComment,
  AdminFeedbackOverview,
  AdminFeedbackSession,
} from '@/lib/feedback/admin'
import { combineTotals } from '@/lib/feedback/totals'
import { SessionFeedbackAdmin } from './SessionFeedbackAdmin'
import { SessionFeedbackAdminPage } from './SessionFeedbackAdminPage'

let n = 0
const comment = (
  colour: AdminFeedbackComment['colour'],
  text: string,
  fields: Partial<AdminFeedbackComment> = {},
): AdminFeedbackComment => ({
  id: `feedbackResponse-${String(++n).padStart(32, '0')}`,
  colour,
  comment: text,
  submittedAt: `2026-10-27T09:${String(10 + n).padStart(2, '0')}:00.000Z`,
  hidden: false,
  flagged: false,
  ...fields,
})

const session = (
  talkId: string,
  title: string,
  [green, yellow, red]: [number, number, number],
  fields: Partial<AdminFeedbackSession> & {
    cards?: [number, number, number]
  } = {},
): AdminFeedbackSession => {
  const { cards, ...rest } = fields
  return {
    talkId,
    title,
    speakers: ['Ada Lovelace'],
    format: 'presentation_40',
    slotAt: '2026-10-27T08:00:00.000Z',
    totals: feedbackTotals({
      live: { green, yellow, red },
      cards: cards && {
        greenCount: cards[0],
        yellowCount: cards[1],
        redCount: cards[2],
      },
    }),
    comments: [],
    ...rest,
  }
}

const SESSIONS: AdminFeedbackSession[] = [
  session('talk-k8s', 'Kubernetes the hard parts, the easy way', [31, 6, 1], {
    speakers: ['Ada Lovelace', 'Grace Hopper'],
    cards: [12, 3, 0],
    comments: [
      comment('green', 'Best talk of the day. The live demo actually worked!'),
      comment('green', 'Clear and practical, I will try this at work.'),
      comment(
        'red',
        'The speaker is an idiot and so is everyone who liked this.',
        { hidden: true },
      ),
      comment('yellow', 'Good content, a bit too fast in the second half.', {
        flagged: true,
      }),
    ],
  }),
  session('talk-ebpf', 'Lightning: eBPF in five minutes', [8, 3, 0], {
    format: 'lightning_10',
    slotAt: '2026-10-27T12:30:00.000Z',
  }),
  session(
    'talk-platform',
    'Platform engineering without a platform team, and why that is fine for most organisations',
    [14, 9, 5],
    {
      speakers: ['Bo Ek'],
      slotAt: '2026-10-28T07:15:00.000Z',
      comments: [comment('red', 'Felt like a sales pitch.')],
    },
  ),
  session('talk-few', 'Observability for small teams', [3, 1, 0], {
    speakers: ['Kari Nordmann'],
    format: 'presentation_20',
  }),
  session('talk-none', 'WebAssembly on the edge', [0, 0, 0], {
    speakers: ['Ola Nordmann'],
    slotAt: null,
  }),
]

const overview = (sessions: AdminFeedbackSession[]): AdminFeedbackOverview => {
  const comments = sessions.flatMap((s) => s.comments)
  return {
    totals: combineTotals(sessions.map((s) => s.totals)),
    comments: comments.length,
    flagged: comments.filter((c) => c.flagged).length,
    sessions,
  }
}

/**
 * The Remove confirmation is portaled out of the story's root, past the
 * global theme decorator's `dark` wrapper; put `dark` on the document too.
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

const meta = {
  title: 'Systems/Proposals/Session Feedback/SessionFeedbackAdmin',
  component: SessionFeedbackAdmin,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The organizers’ Session Feedback page, `/admin/feedback` (speaker feedback spec §10.1, §10.3): stat cards, every session ranked by the share of “Loved it” (fewer than 10 responses show “too few” and rank last), sortable by responses and comments, and rows that open to the session’s comments with Hide, Unhide and Remove. Remove asks first, naming the count. Dark mode follows the global `theme` toolbar (story-level `globals`), applied to the document as well because the confirmation is portaled.',
      },
    },
  },
  decorators: [
    (Story, context) => (
      <DocumentTheme dark={context.globals.theme === 'dark'}>
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8 dark:bg-gray-900">
          <Story />
        </div>
      </DocumentTheme>
    ),
  ],
  args: {
    overview: overview(SESSIONS),
    conferenceTitle: 'Cloud Native Days Norway 2026',
    onHide: fn(async () => {}),
    onUnhide: fn(async () => {}),
    onRemove: fn(async () => {}),
  },
} satisfies Meta<typeof SessionFeedbackAdmin>

export default meta
type Story = StoryObj<typeof meta>

/** The session rows' titles, top to bottom. */
const rowTitles = (canvasElement: HTMLElement) =>
  within(canvasElement)
    .getAllByRole('button', { expanded: false })
    .map((b: HTMLElement) => b.querySelector('span.font-medium')?.textContent)

export const Ranked: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Ranked by the share of Loved it; too few (under 10) after the rest.
    await expect(rowTitles(canvasElement)).toEqual([
      'Kubernetes the hard parts, the easy way',
      'Lightning: eBPF in five minutes',
      'Platform engineering without a platform team, and why that is fine for most organisations',
      'Observability for small teams',
      'WebAssembly on the edge',
    ])
    await expect(canvas.getAllByText('too few')).toHaveLength(2)
    await userEvent.click(canvas.getByRole('button', { name: /Comments/ }))
    await expect(rowTitles(canvasElement)[0]).toBe(
      'Kubernetes the hard parts, the easy way',
    )
    await expect(rowTitles(canvasElement)[1]).toBe(
      'Platform engineering without a platform team, and why that is fine for most organisations',
    )
  },
}

export const RankedDark: Story = { globals: { theme: 'dark' } }

const openFirst: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  await userEvent.click(
    canvas.getByRole('button', { name: /Kubernetes the hard parts/ }),
  )
  await expect(
    canvas.getByText(/Best talk of the day/, { exact: false }),
  ).toBeVisible()
}

export const Expanded: Story = {
  play: async (context) => {
    await openFirst(context)
    const canvas = within(context.canvasElement)
    await expect(canvas.getByText('Hidden from speakers')).toBeVisible()
    await expect(canvas.getByText('Flagged by a speaker')).toBeVisible()
    await userEvent.click(canvas.getAllByRole('button', { name: 'Hide' })[0])
    await expect(context.args.onHide).toHaveBeenCalledWith(
      SESSIONS[0].comments[0].id,
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Unhide' }))
    await expect(context.args.onUnhide).toHaveBeenCalledWith(
      SESSIONS[0].comments[2].id,
    )
  },
}

export const ExpandedDark: Story = {
  play: openFirst,
  globals: { theme: 'dark' },
}

const askRemove: Story['play'] = async (context) => {
  await openFirst(context)
  const canvas = within(context.canvasElement)
  await userEvent.click(canvas.getAllByRole('button', { name: 'Remove' })[3])
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: 'Remove 1 response?' }),
    ).toBeVisible(),
  )
}

/** Remove asks first, naming the count and quoting the comment. */
export const RemoveAsks: Story = { play: askRemove }

/** …and removes once confirmed: the dialog closes. */
export const RemoveConfirmed: Story = {
  play: async (context) => {
    await askRemove(context)
    await expect(context.args.onRemove).not.toHaveBeenCalled()
    // The confirm button ignores taps for a moment after it opens.
    await new Promise((r) => setTimeout(r, 600))
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Remove',
      }),
    )
    await expect(context.args.onRemove).toHaveBeenCalledWith([
      SESSIONS[0].comments[3].id,
    ])
  },
}

export const RemoveAsksDark: Story = {
  play: askRemove,
  globals: { theme: 'dark' },
}

export const ActionFailed: Story = {
  args: {
    onHide: fn(async () => {
      throw new Error('Feedback Response not found')
    }),
  },
  play: async (context) => {
    await openFirst(context)
    const canvas = within(context.canvasElement)
    await userEvent.click(canvas.getAllByRole('button', { name: 'Hide' })[0])
    await waitFor(() =>
      expect(canvas.getByRole('alert')).toHaveTextContent(
        'Feedback Response not found',
      ),
    )
  },
}

export const NoSessions: Story = { args: { overview: overview([]) } }

export const NoSessionsDark: Story = {
  args: { overview: overview([]) },
  globals: { theme: 'dark' },
}

/** Phone width: rows stack, the sort buttons sit in one line. */
export const Phone: Story = {
  parameters: { viewport: { defaultViewport: 'phone' } },
  play: async (context) => {
    await openFirst(context)
    const canvas = within(context.canvasElement)
    await expect(canvas.getByText('Sort by')).toBeVisible()
    await expect(canvas.getAllByText('loved it')[0]).toBeVisible()
  },
}

export const PhoneDark: Story = {
  ...Phone,
  globals: { theme: 'dark' },
}

const TRPC_OVERVIEW = '/api/trpc/sessionFeedback.adminOverview'
const TRPC_HIDE = '/api/trpc/sessionFeedback.adminHide'
const trpc = (data: unknown) => HttpResponse.json({ result: { data } })
const hideRequests: unknown[] = []

/** The page as `/admin/feedback` renders it, its procedures mocked. */
export const Page: StoryObj<typeof SessionFeedbackAdminPage> = {
  render: () => (
    <SessionFeedbackAdminPage conferenceTitle="Cloud Native Days Norway 2026" />
  ),
  parameters: {
    msw: {
      handlers: [
        http.get(TRPC_OVERVIEW, () => trpc(overview(SESSIONS))),
        http.post(TRPC_HIDE, async ({ request }) => {
          hideRequests.push(await request.json())
          return trpc({ count: 1 })
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: /Kubernetes the hard parts/ }),
      ).toBeVisible(),
    )
    hideRequests.length = 0
    await userEvent.click(
      canvas.getByRole('button', { name: /Kubernetes the hard parts/ }),
    )
    await userEvent.click(canvas.getAllByRole('button', { name: 'Hide' })[0])
    // Hide goes to its procedure with the response's id, and nothing else.
    await waitFor(() =>
      expect(JSON.stringify(hideRequests)).toContain(
        SESSIONS[0].comments[0].id,
      ),
    )
    await expect(JSON.stringify(hideRequests)).not.toContain('conference')
  },
}
