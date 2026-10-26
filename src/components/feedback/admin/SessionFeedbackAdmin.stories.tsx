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
import type { RemoveRequest, RemovedCounts } from '@/lib/feedback/bulk-remove'
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
  rev: `rev-${n}`,
  judgement: null,
  kept: null,
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
    onKeep: fn<(comment: AdminFeedbackComment) => Promise<void>>(
      async () => {},
    ),
    // What a Remove of answers still as seen does: they all go.
    onRemove: fn(async (request: RemoveRequest) => ({
      removed: request.responses.length,
      gone: 0,
      changed: 0,
    })),
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

/** The sessions list, below the flagged-by-speakers box. */
const sessionsList = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole('region', { name: 'Sessions' })

/** The list item, in the sessions list, of the comment starting with `text`. */
const commentItem = (canvasElement: HTMLElement, text: RegExp) =>
  within(sessionsList(canvasElement))
    .getByText(text)
    .closest('li') as HTMLElement

/** The flagged-by-speakers box. */
const flaggedBox = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole('region', { name: /Flagged by speakers/ })

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
    const panel = panelOf(context.canvasElement, /Kubernetes the hard parts/)
    await userEvent.click(
      within(panel).getAllByRole('button', { name: 'Hide' })[0],
    )
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
    // Each announcement names its comment after the words (F7).
    const hidden = (t: string) => t.startsWith('Comment hidden from speakers.')
    await expect(seen.filter(hidden).length).toBeGreaterThanOrEqual(2)
    await expect(seen.indexOf('')).toBeGreaterThan(seen.findIndex(hidden))
  },
}

/** Data that drops removed comments, as a refetch would. */
function Removing(args: React.ComponentProps<typeof SessionFeedbackAdmin>) {
  const [data, setData] = useState(overview(SESSIONS))
  return (
    <SessionFeedbackAdmin
      {...args}
      overview={data}
      onRemove={async (request) => {
        const done = await args.onRemove(request)
        const ids = new Set(request.responses.map((r) => r.id))
        setData((d) =>
          overview(
            d.sessions.map((s) => ({
              ...s,
              comments: s.comments.filter((c) => !ids.has(c.id)),
            })),
          ),
        )
        return done
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

/**
 * The red flagged-by-speakers box (§10.1): each flagged comment with its
 * session's title, and Keep, Hide and Remove.
 */
export const Flagged: Story = {
  play: async ({ canvasElement, args }) => {
    const box = flaggedBox(canvasElement)
    const items = within(box).getAllByRole('listitem')
    await expect(items).toHaveLength(1)
    await expect(
      within(items[0]).getByText('Kubernetes the hard parts, the easy way'),
    ).toBeVisible()
    await expect(
      within(items[0]).getByText(/^Good content, a bit too fast/),
    ).toBeVisible()
    await userEvent.click(
      within(items[0]).getByRole('button', { name: 'Keep' }),
    )
    // With the flag the page showed, so a newer one is not cleared unseen.
    await expect(args.onKeep).toHaveBeenCalledWith(SESSIONS[0].comments[3])
    await waitFor(() =>
      expect(announced(canvasElement)).toHaveTextContent(
        'Kept: the flag is cleared, speakers still see the comment.',
      ),
    )
    // Said in the box, beside the comment, not in the session's row.
    await expect(
      within(items[0]).getByText(/^Kept: the flag is cleared/),
    ).toBeVisible()
  },
}

export const FlaggedDark: Story = {
  play: async ({ canvasElement }) =>
    expect(flaggedBox(canvasElement)).toBeVisible(),
  globals: { theme: 'dark' },
}

export const FlaggedPhone: Story = {
  ...FlaggedDark,
  globals: { theme: 'light' },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

export const FlaggedPhoneDark: Story = {
  ...FlaggedPhone,
  globals: { theme: 'dark' },
}

/** Data that acts on the flag as a refetch would. */
function Moderating(args: React.ComponentProps<typeof SessionFeedbackAdmin>) {
  const [data, setData] = useState(overview(SESSIONS))
  const update = (id: string, change: Partial<AdminFeedbackComment>) =>
    setData((d) =>
      overview(
        d.sessions.map((s) => ({
          ...s,
          // Each write is a new revision, as in Sanity.
          comments: s.comments.map((c) =>
            c.id === id ? { ...c, ...change, rev: `${c.rev}+` } : c,
          ),
        })),
      ),
    )
  return (
    <SessionFeedbackAdmin
      {...args}
      overview={data}
      onKeep={async (c) => {
        await args.onKeep(c)
        update(c.id, { flagged: false })
      }}
      onHide={async (id) => {
        await args.onHide(id)
        update(id, { flagged: false, hidden: true })
      }}
    />
  )
}

/**
 * Hide from the box: the comment leaves it, the box says what happened and
 * that nothing else is flagged; the session's row shows it hidden, no
 * longer flagged.
 */
export const FlaggedHidden: Story = {
  render: (args) => <Moderating {...args} />,
  play: async (context) => {
    const { canvasElement, args } = context
    const box = flaggedBox(canvasElement)
    await userEvent.click(within(box).getByRole('button', { name: 'Hide' }))
    await expect(args.onHide).toHaveBeenCalledWith(SESSIONS[0].comments[3].id)
    await waitFor(() =>
      expect(within(box).getByText('Nothing else is flagged.')).toBeVisible(),
    )
    const note = within(box).getByText('Comment hidden from speakers.')
    await expect(note).toBeVisible()
    // Hide went with its comment; focus is on the box, not lost, and not on
    // the note the live region already says.
    await waitFor(() =>
      expect(
        within(box).getByRole('heading', { name: /Flagged by speakers/ }),
      ).toHaveFocus(),
    )
    await expect(within(box).queryByRole('listitem')).toBeNull()
    await openFirst(context)
    const item = commentItem(canvasElement, /^Good content/)
    await expect(within(item).getByText('Hidden from speakers')).toBeVisible()
    await expect(within(item).queryByText('Flagged by a speaker')).toBeNull()
    await expect(
      within(canvasElement).queryByRole('button', {
        name: /a comment is flagged/,
      }),
    ).toBeNull()
  },
}

/** Keep in the session's row, on the flagged comment only. */
export const ExpandedKeep: Story = {
  render: (args) => <Moderating {...args} />,
  play: async (context) => {
    await openFirst(context)
    const panel = panelOf(context.canvasElement, /Kubernetes the hard parts/)
    const keeps = within(panel).getAllByRole('button', { name: 'Keep' })
    await expect(keeps).toHaveLength(1)
    await userEvent.click(keeps[0])
    await expect(context.args.onKeep).toHaveBeenCalledWith(
      SESSIONS[0].comments[3],
    )
    const item = commentItem(context.canvasElement, /^Good content/)
    await waitFor(() =>
      expect(within(item).queryByText('Flagged by a speaker')).toBeNull(),
    )
    await expect(within(item).getByText(/^Kept: the flag/)).toBeVisible()
    // Keep's button went with the flag: focus is on the comment it was
    // about (the live region says what happened).
    await waitFor(() =>
      expect(within(item).getByText(/^Good content/)).toHaveFocus(),
    )
    // The box stays, empty, so the open row below does not jump up; the
    // Keep was not done there, so it says nothing about it.
    const box = flaggedBox(context.canvasElement)
    await expect(
      within(box).getByText('Nothing else is flagged.'),
    ).toBeVisible()
    await expect(within(box).queryByText(/^Kept/)).toBeNull()
  },
}

/** Moderating, plus a speaker who flags the kept comment again. */
function FlaggedAgain(args: React.ComponentProps<typeof SessionFeedbackAdmin>) {
  const [data, setData] = useState(overview(SESSIONS))
  const flaggedId = SESSIONS[0].comments[3].id
  const set = (flagged: boolean) =>
    setData((d) =>
      overview(
        d.sessions.map((s) => ({
          ...s,
          comments: s.comments.map((c) =>
            c.id === flaggedId ? { ...c, flagged, rev: `${c.rev}+` } : c,
          ),
        })),
      ),
    )
  return (
    <>
      <SessionFeedbackAdmin
        {...args}
        overview={data}
        onKeep={async (c) => {
          await args.onKeep(c)
          set(false)
        }}
      />
      <button type="button" onClick={() => set(true)}>
        A speaker flags it again
      </button>
    </>
  )
}

/**
 * Keep, then a speaker flags the same comment again: it is back in the box
 * WITHOUT the old "Kept" note beside its live Keep.
 */
export const KeptThenFlaggedAgain: Story = {
  render: (args) => <FlaggedAgain {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = flaggedBox(canvasElement)
    await userEvent.click(within(box).getByRole('button', { name: 'Keep' }))
    await waitFor(() =>
      expect(within(box).getByText(/^Kept: the flag/)).toBeVisible(),
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'A speaker flags it again' }),
    )
    const item = await within(box).findByRole('listitem')
    await expect(within(item).getByText(/^Good content/)).toBeVisible()
    await expect(
      within(item).getByRole('button', { name: 'Keep' }),
    ).toBeVisible()
    await expect(within(box).queryByText(/^Kept: the flag/)).toBeNull()
  },
}

/**
 * Keep refused because another organizer already kept the comment: said as
 * the server found it, naming the comment, not as an error.
 */
export const KeepAlreadyHandled: Story = {
  render: function Render(args) {
    const [data, setData] = useState(overview(SESSIONS))
    return (
      <SessionFeedbackAdmin
        {...args}
        overview={data}
        onKeep={async () => {
          setData(
            overview(
              SESSIONS.map((s) => ({
                ...s,
                comments: s.comments.map((c) => ({
                  ...c,
                  flagged: false,
                  rev: `${c.rev}+`,
                })),
              })),
            ),
          )
          return { kept: false, now: 'unflagged' }
        }}
      />
    )
  },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    const box = flaggedBox(canvasElement)
    await userEvent.click(within(box).getByRole('button', { name: 'Keep' }))
    await waitFor(() =>
      expect(
        within(box).getByText(
          'Already handled by another organizer: no longer flagged.',
        ),
      ).toBeVisible(),
    )
    await expect(
      within(box).getByText(
        /^Kubernetes the hard parts, the easy way: “Good content/,
      ),
    ).toBeVisible()
  },
}

export const KeepAlreadyHandledDark: Story = {
  ...KeepAlreadyHandled,
  globals: { theme: 'dark' },
}

/** As the page runs a Remove: the re-read lands before it resolves. */
function RemovingAsThePage(
  args: React.ComponentProps<typeof SessionFeedbackAdmin>,
) {
  const [data, setData] = useState(overview(SESSIONS))
  return (
    <SessionFeedbackAdmin
      {...args}
      overview={data}
      onRemove={async (request) => {
        const ids = new Set(request.responses.map((r) => r.id))
        setData((d) =>
          overview(
            d.sessions.map((s) => ({
              ...s,
              comments: s.comments.filter((c) => !ids.has(c.id)),
            })),
          ),
        )
        await new Promise((r) => setTimeout(r, 50))
        return args.onRemove(request)
      }}
    />
  )
}

/**
 * Remove from the box: its button goes while the dialog holds focus, so
 * focus lands on the box's heading once the dialog has gone.
 */
export const FlaggedRemoved: Story = {
  render: (args) => <RemovingAsThePage {...args} />,
  play: async ({ canvasElement }) => {
    const box = flaggedBox(canvasElement)
    await userEvent.click(within(box).getByRole('button', { name: 'Remove' }))
    await confirmRemove()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() =>
      expect(
        within(box).getByRole('heading', { name: /Flagged by speakers/ }),
      ).toHaveFocus(),
    )
  },
}

/** Remove from the box asks first, like everywhere else. */
export const FlaggedRemoveAsks: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(flaggedBox(canvasElement)).getByRole('button', {
        name: 'Remove',
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Remove 1 response?' }),
      ).toBeVisible(),
    )
  },
}

/** No flag waiting: no box. */
export const NothingFlagged: Story = {
  args: {
    overview: overview(
      SESSIONS.map((s) => ({
        ...s,
        comments: s.comments.map((c) => ({ ...c, flagged: false })),
      })),
    ),
  },
  play: async ({ canvasElement }) =>
    expect(
      within(canvasElement).queryByRole('region', {
        name: /Flagged by speakers/,
      }),
    ).toBeNull(),
}

export const ExpandedDark: Story = {
  play: openFirst,
  globals: { theme: 'dark' },
}

const askRemove: Story['play'] = async (context) => {
  await openFirst(context)
  const canvas = within(context.canvasElement)
  const panel = panelOf(context.canvasElement, /Kubernetes the hard parts/)
  await expect(canvas.getByText(/Best talk/)).toBeVisible()
  await userEvent.click(
    within(panel).getAllByRole('button', { name: 'Remove' })[3],
  )
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
    // The answer as shown: removed only while it is still that one.
    await expect(context.args.onRemove).toHaveBeenCalledWith({
      responses: [
        {
          id: SESSIONS[0].comments[3].id,
          submittedAt: SESSIONS[0].comments[3].submittedAt,
        },
      ],
    })
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
  args: {
    onRemove: fn<(request: RemoveRequest) => Promise<RemovedCounts>>(
      () => new Promise(() => {}),
    ),
  },
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
      onRemove={async (request) => {
        const done = await args.onRemove(request)
        setData(overview([TEN_AFTER, OTHER]))
        return done
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

/**
 * The attendee answered again while the question was open: nothing is
 * removed, and the comment says it was kept.
 */
export const RemoveChangedMeanwhile: Story = {
  args: {
    onRemove: fn<(request: RemoveRequest) => Promise<RemovedCounts>>(
      async () => ({ removed: 0, gone: 0, changed: 1 }),
    ),
  },
  play: async (context) => {
    await askRemove(context)
    await confirmRemove()
    const item = commentItem(context.canvasElement, /^Good content/)
    await waitFor(() =>
      expect(
        within(item).getByText('It had changed since you looked and was kept.'),
      ).toBeVisible(),
    )
  },
}

/** A failed Remove closes the dialog so its message on the page is seen. */
export const RemoveFailed: Story = {
  args: {
    onRemove: fn<(request: RemoveRequest) => Promise<RemovedCounts>>(
      async () => {
        throw new Error(
          'Removed 0 of 1 responses. Reload to see what’s left, then remove those.',
        )
      },
    ),
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
const TRPC_KEEP = '/api/trpc/sessionFeedback.adminKeep'
const keepRequests: unknown[] = []
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
        http.post(TRPC_KEEP, async ({ request }) => {
          keepRequests.push(await request.json())
          return trpc({ kept: true })
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
    await userEvent.click(
      within(panelOf(canvasElement, /Kubernetes the hard parts/)).getAllByRole(
        'button',
        { name: 'Hide' },
      )[0],
    )
    // Hide goes to its procedure with the response's id, and nothing else.
    await waitFor(() =>
      expect(JSON.stringify(hideRequests)).toContain(
        SESSIONS[0].comments[0].id,
      ),
    )
    await expect(JSON.stringify(hideRequests)).not.toContain('conference')
    // Keep sends the revision the page showed, so nothing newer is cleared.
    keepRequests.length = 0
    await userEvent.click(
      within(flaggedBox(canvasElement)).getByRole('button', { name: 'Keep' }),
    )
    await waitFor(() =>
      expect(keepRequests).toEqual([
        {
          responseId: SESSIONS[0].comments[3].id,
          rev: SESSIONS[0].comments[3].rev,
        },
      ]),
    )
  },
}
