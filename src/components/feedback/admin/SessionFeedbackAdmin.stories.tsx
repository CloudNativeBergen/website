import { useEffect, useState, type ReactNode } from 'react'
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
import { Format } from '@/lib/proposal/types'
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
    format: Format.presentation_40,
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
    format: Format.lightning_10,
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
    format: Format.presentation_20,
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
    onHide: fn<(id: string) => Promise<void>>(async () => {}),
    onUnhide: fn(async () => {}),
    onRemove: fn(async () => {}),
  },
} satisfies Meta<typeof SessionFeedbackAdmin>

export default meta
type Story = StoryObj<typeof meta>

/** The session rows' titles, top to bottom, open or not. */
const rowTitles = (canvasElement: HTMLElement) =>
  within(canvasElement)
    .getAllByRole('button')
    .filter((b: HTMLElement) => b.hasAttribute('aria-expanded'))
    .map(
      (b: HTMLElement) =>
        b.querySelector('span.font-medium')?.firstChild?.textContent,
    )

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
    await expect(canvas.getAllByText(/^too few/)).toHaveLength(2)
    // Both live regions are in the accessibility tree before they speak.
    await expect(canvas.getAllByRole('status')).toHaveLength(2)
    // Only the session holding a flagged comment carries the flag.
    await expect(
      canvas.getAllByRole('button', { name: /a comment is flagged/ }),
    ).toHaveLength(1)
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

/** The live region every outcome is announced in. */
/** The live region every outcome is announced in: the page's first. */
const announced = (canvasElement: HTMLElement) =>
  within(canvasElement).getAllByRole('status')[0]

/** The list item of the comment whose text starts with `text`. */
const commentItem = (canvasElement: HTMLElement, text: RegExp) =>
  within(canvasElement).getByText(text).closest('li') as HTMLElement

/** The open panel of the row titled `title`. */
const panelOf = (canvasElement: HTMLElement, title: RegExp) => {
  const button = within(canvasElement).getByRole('button', { name: title })
  return document.getElementById(
    button.getAttribute('aria-controls')!,
  ) as HTMLElement
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
    await waitFor(() =>
      expect(announced(context.canvasElement)).toHaveTextContent(
        'Comment hidden from speakers.',
      ),
    )
    // Said beside the comment it was about, not at the top of the row.
    await expect(
      within(commentItem(context.canvasElement, /^Best talk/)).getByText(
        'Comment hidden from speakers.',
      ),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Unhide' }))
    await expect(context.args.onUnhide).toHaveBeenCalledWith(
      SESSIONS[0].comments[2].id,
    )
    await waitFor(() =>
      expect(announced(context.canvasElement)).toHaveTextContent(
        'Comment shown to speakers again.',
      ),
    )
  },
}

/**
 * Two Hides in a row say the same words: the live region is emptied first,
 * in its own render, so the second is announced too.
 */
export const SameOutcomeTwice: Story = {
  play: async (context) => {
    await openFirst(context)
    const region = announced(context.canvasElement)
    const seen: string[] = []
    const observer = new MutationObserver(() =>
      seen.push(region.textContent ?? ''),
    )
    observer.observe(region, {
      childList: true,
      characterData: true,
      subtree: true,
    })
    for (const text of [/^Best talk/, /^Clear and practical/]) {
      const item = commentItem(context.canvasElement, text)
      await userEvent.click(within(item).getByRole('button', { name: 'Hide' }))
      await waitFor(() =>
        expect(
          within(item).getByText('Comment hidden from speakers.'),
        ).toBeVisible(),
      )
    }
    observer.disconnect()
    await expect(
      seen.filter((t) => t === 'Comment hidden from speakers.').length,
    ).toBeGreaterThanOrEqual(2)
    await expect(seen.indexOf('')).toBeGreaterThan(
      seen.indexOf('Comment hidden from speakers.'),
    )
  },
}

/** Data that drops removed comments, as a refetch would. */
function Removing(args: React.ComponentProps<typeof SessionFeedbackAdmin>) {
  const [data, setData] = useState(overview(SESSIONS))
  return (
    <SessionFeedbackAdmin
      {...args}
      overview={data}
      onRemove={async (ids) => {
        await args.onRemove(ids)
        setData((d) =>
          overview(
            d.sessions.map((s) => ({
              ...s,
              comments: s.comments.filter((c) => !ids.includes(c.id)),
            })),
          ),
        )
      }}
    />
  )
}

/** Two Removes in one row: only the latest one's note stays. */
export const TwoRemovals: Story = {
  render: (args) => <Removing {...args} />,
  play: async (context) => {
    await openFirst(context)
    const canvas = within(context.canvasElement)
    for (const text of [/^Best talk/, /^Clear and practical/]) {
      const item = commentItem(context.canvasElement, text)
      await userEvent.click(
        within(item).getByRole('button', { name: 'Remove' }),
      )
      await confirmRemove()
      await waitFor(() => expect(canvas.queryByText(text)).toBeNull())
    }
    const panel = panelOf(context.canvasElement, /Kubernetes the hard parts/)
    await expect(
      within(panel).getAllByText('1 response removed.'),
    ).toHaveLength(1)
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
    // The data here never refreshes, so the comment is still listed: the
    // note says the removal worked and the list is behind, by the comment.
    const item = commentItem(context.canvasElement, /^Good content/)
    await waitFor(() =>
      expect(
        within(item).getByText(
          'Removed. This list is out of date until it refreshes.',
        ),
      ).toBeVisible(),
    )
    await expect(
      within(
        panelOf(context.canvasElement, /Kubernetes the hard parts/),
      ).queryByText('1 response removed.'),
    ).toBeNull()
    await expect(announced(context.canvasElement)).toHaveTextContent(
      '1 response removed.',
    )
  },
}

const confirmRemove = async () => {
  // The confirm button ignores taps for a moment after it opens.
  await new Promise((r) => setTimeout(r, 600))
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }),
  )
}

/** While the delete runs, Escape does not close the question. */
export const RemovePending: Story = {
  args: { onRemove: fn(() => new Promise<never>(() => {})) },
  play: async (context) => {
    await askRemove(context)
    await confirmRemove()
    await userEvent.keyboard('{Escape}')
    await new Promise((r) => setTimeout(r, 400))
    await expect(
      screen.getByRole('heading', { name: 'Remove 1 response?' }),
    ).toBeVisible()
  },
}

const TEN = session('talk-ten', 'Exactly ten answers', [10, 0, 0], {
  speakers: ['Kari Nordmann'],
  comments: [comment('green', 'Ten out of ten.')],
})
const OTHER = session('talk-other', 'Another session', [9, 3, 0], {
  speakers: ['Ola Nordmann'],
})
/** After the one comment of TEN is removed: 9 answers, too few to rank. */
const TEN_AFTER: AdminFeedbackSession = {
  ...TEN,
  totals: feedbackTotals({ live: { green: 9, yellow: 0, red: 0 } }),
  comments: [],
}

/** The page with its data in state, so Remove changes what it shows. */
function Refetching(args: React.ComponentProps<typeof SessionFeedbackAdmin>) {
  const [data, setData] = useState(overview([TEN, OTHER]))
  return (
    <SessionFeedbackAdmin
      {...args}
      overview={data}
      onRemove={async (ids) => {
        await args.onRemove(ids)
        setData(overview([TEN_AFTER, OTHER]))
      }}
    />
  )
}

/**
 * Removing a response can drop a session under 10 answers. Its row stays
 * where it is (and open) instead of jumping to the end of the list.
 */
export const RemoveKeepsRowInPlace: Story = {
  render: (args) => <Refetching {...args} />,
  parameters: { viewport: { defaultViewport: 'phone' } },
  play: async (context) => {
    const { canvasElement } = context
    const canvas = within(canvasElement)
    await expect(rowTitles(canvasElement)).toEqual([
      'Exactly ten answers',
      'Another session',
    ])
    await userEvent.click(
      canvas.getByRole('button', { name: /Exactly ten answers/ }),
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Remove' }))
    await confirmRemove()
    const panel = panelOf(canvasElement, /Exactly ten answers/)
    await waitFor(() =>
      expect(within(panel).getByText('1 response removed.')).toBeVisible(),
    )
    // Still first and still open, though it now has too few to rank.
    await expect(rowTitles(canvasElement)).toEqual([
      'Exactly ten answers',
      'Another session',
    ])
    await expect(
      canvas.getByRole('button', { name: /Exactly ten answers/ }),
    ).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByText(/^too few/)).toBeVisible()
    // The order no longer matches the sort, and says so.
    await expect(canvas.getByText(/Order kept while you work/)).toBeVisible()
    // Collapsing the row clears its note.
    await userEvent.click(
      canvas.getByRole('button', { name: /Exactly ten answers/ }),
    )
    await userEvent.click(
      canvas.getByRole('button', { name: /Exactly ten answers/ }),
    )
    await expect(
      within(panelOf(canvasElement, /Exactly ten answers/)).queryByText(
        '1 response removed.',
      ),
    ).toBeNull()
    // Re-sort ranks again: the session with too few goes last.
    await userEvent.click(canvas.getByRole('button', { name: 'Re-sort' }))
    // The cue and its button go: focus moves to the active sort.
    await expect(document.activeElement).toBe(
      canvas.getByRole('button', { name: /Loved it/, pressed: true }),
    )
    await expect(rowTitles(canvasElement)).toEqual([
      'Another session',
      'Exactly ten answers',
    ])
    await expect(canvas.queryByText(/Order kept while you work/)).toBeNull()
  },
}

/** A failed Remove closes the dialog so its message on the page is seen. */
export const RemoveFailed: Story = {
  args: {
    onRemove: fn(async () => {
      throw new Error(
        'Removed 0 of 1 responses. Reload to see what’s left, then remove those.',
      )
    }),
  },
  play: async (context) => {
    await askRemove(context)
    await new Promise((r) => setTimeout(r, 600))
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Remove',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Under the comment it was about, and announced.
    await expect(
      within(commentItem(context.canvasElement, /^Good content/)).getByText(
        /Removed 0 of 1/,
      ),
    ).toBeVisible()
    await expect(announced(context.canvasElement)).toHaveTextContent(
      'Removed 0 of 1',
    )
  },
}

export const RemoveAsksDark: Story = {
  play: askRemove,
  globals: { theme: 'dark' },
}

export const ActionFailed: Story = {
  args: {
    onHide: fn<(id: string) => Promise<void>>(async () => {
      throw new Error('Feedback Response not found')
    }),
  },
  parameters: { viewport: { defaultViewport: 'phone' } },
  play: async (context) => {
    await openFirst(context)
    const canvas = within(context.canvasElement)
    // The last comment's Hide, far down the page on a phone.
    const item = commentItem(context.canvasElement, /^Good content/)
    await userEvent.click(within(item).getByRole('button', { name: 'Hide' }))
    // The message sits under that comment, on screen, and is announced.
    await waitFor(() =>
      expect(
        within(item).getByText('Feedback Response not found'),
      ).toBeVisible(),
    )
    const box = within(item)
      .getByText('Feedback Response not found')
      .getBoundingClientRect()
    await expect(box.top).toBeGreaterThanOrEqual(0)
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight)
    await expect(announced(context.canvasElement)).toHaveTextContent(
      'Feedback Response not found',
    )
    await expect(canvas.queryByRole('alert')).toBeNull()
  },
}

export const ActionFailedDark: Story = {
  ...ActionFailed,
  globals: { theme: 'dark' },
}

/** A refetch failed: the numbers on screen are kept and said to be earlier ones. */
export const RefreshFailed: Story = {
  args: { refreshFailed: { onRetry: fn(), retrying: false } },
  play: async (context) => {
    const canvas = within(context.canvasElement)
    const note = canvas.getByText(/Couldn’t refresh, showing earlier numbers/)
    await expect(note).toBeVisible()
    // Announced politely, from a region that holds the words only.
    const region = note.closest('[role="status"]') as HTMLElement
    await expect(region).toHaveAttribute('aria-live', 'polite')
    await expect(within(region).queryByRole('button')).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Retry' }))
    await expect(context.args.refreshFailed!.onRetry).toHaveBeenCalled()
  },
}

/** A retry that fails again says so, after showing it is retrying. */
function Retrying(args: React.ComponentProps<typeof SessionFeedbackAdmin>) {
  const [retrying, setRetrying] = useState(false)
  return (
    <SessionFeedbackAdmin
      {...args}
      refreshFailed={{
        retrying,
        onRetry: () => {
          setRetrying(true)
          setTimeout(() => setRetrying(false), 300)
        },
      }}
    />
  )
}

export const RefreshFailsAgain: Story = {
  render: (args) => <Retrying {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Retry' }))
    await expect(
      canvas.getByRole('button', { name: 'Retrying…' }),
    ).toHaveAttribute('aria-disabled', 'true')
    await waitFor(() =>
      expect(
        canvas.getByText(/Still couldn’t refresh, showing earlier numbers/),
      ).toBeVisible(),
    )
  },
}

const ROW_A = (counts: [number, number, number]) =>
  session('talk-row-a', 'Row A', counts)
const ROW_B = (counts: [number, number, number]) =>
  session('talk-row-b', 'Row B', counts)
const STEPS = [
  overview([]),
  overview([ROW_A([12, 0, 0]), ROW_B([6, 6, 0])]),
  overview([ROW_A([6, 6, 0]), ROW_B([12, 0, 0])]),
]

/** Data that changes on a story-only button, as refetches would. */
function Stepping(args: React.ComponentProps<typeof SessionFeedbackAdmin>) {
  const [step, setStep] = useState(0)
  return (
    <>
      <button type="button" onClick={() => setStep((n) => n + 1)}>
        Next data
      </button>
      <SessionFeedbackAdmin {...args} overview={STEPS[step]} />
    </>
  )
}

/**
 * Rows that arrive after the page loaded keep their place too: the list was
 * empty at load, then two rows came, then their numbers swapped.
 */
export const NewRowsKeepTheirPlace: Story = {
  render: (args) => <Stepping {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const next = () =>
      userEvent.click(canvas.getByRole('button', { name: 'Next data' }))
    await next()
    await expect(rowTitles(canvasElement)).toEqual(['Row A', 'Row B'])
    await expect(canvas.queryByText(/Order kept while you work/)).toBeNull()
    await next()
    await expect(rowTitles(canvasElement)).toEqual(['Row A', 'Row B'])
    await expect(canvas.getByText(/Order kept while you work/)).toBeVisible()
  },
}

/** Two actions in flight: each failure stays by its own comment. */
export const OverlappingFailures: Story = {
  args: {
    onHide: fn(async (id: string) => {
      await new Promise((r) =>
        setTimeout(r, id === SESSIONS[0].comments[0].id ? 300 : 50),
      )
      throw new Error(`Could not hide ${id.slice(-2)}`)
    }),
  },
  play: async (context) => {
    await openFirst(context)
    const first = commentItem(context.canvasElement, /^Best talk/)
    const last = commentItem(context.canvasElement, /^Good content/)
    await userEvent.click(within(first).getByRole('button', { name: 'Hide' }))
    await userEvent.click(within(last).getByRole('button', { name: 'Hide' }))
    await waitFor(() =>
      expect(within(first).getByText(/Could not hide/)).toBeVisible(),
    )
    await expect(within(last).getByText(/Could not hide/)).toBeVisible()
  },
}

export const RefreshFailedDark: Story = {
  ...RefreshFailed,
  globals: { theme: 'dark' },
}

/** Further down the page on a phone, the note stays in view. */
export const RefreshFailedPhone: Story = {
  args: { refreshFailed: { onRetry: fn(), retrying: false } },
  parameters: { viewport: { defaultViewport: 'phone' } },
  play: async (context) => {
    await openFirst(context)
    window.scrollTo(0, document.documentElement.scrollHeight)
    await new Promise((r) => setTimeout(r, 100))
    const box = within(context.canvasElement)
      .getByText(/Couldn’t refresh/)
      .getBoundingClientRect()
    await expect(box.top).toBeGreaterThanOrEqual(0)
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight)
  },
}

export const RefreshFailedPhoneDark: Story = {
  ...RefreshFailedPhone,
  globals: { theme: 'dark' },
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
    // Sort buttons are a full tap target on a phone.
    for (const b of within(
      canvas.getByRole('group', { name: 'Sort sessions' }),
    ).getAllByRole('button'))
      await expect(b.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  },
}

/** 320 px: the breakdown's colour labels stay on one line. */
export const PhoneNarrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async (context) => {
    await openFirst(context)
    const panel = panelOf(context.canvasElement, /Kubernetes the hard parts/)
    for (const label of ['Loved it', 'It was OK', 'Not for me']) {
      const dt = within(panel).getByText(label, { selector: 'dt' })
      await expect(dt.getBoundingClientRect().height).toBeLessThan(20)
    }
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
