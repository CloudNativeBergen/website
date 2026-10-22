import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { feedbackTotals } from '@/lib/feedback/totals'
import { FeedbackResultsView } from './FeedbackResultsView'

const meta = {
  title: 'Systems/Proposals/Session Feedback/FeedbackResultsView',
  component: FeedbackResultsView,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The **Session Feedback** tab’s content (speaker feedback spec §9.3): a stacked colour bar, combined totals per colour (scanned plus Card Counts, with a Scanned vs cards breakdown), a Live badge while the window is open, and the visible comments oldest first, each with a **Flag** for organizers behind an inline confirmation (one-way for speakers), or the "Flagged for organizers" marker every speaker of the talk sees until an organizer acts (§10.3). Presentational. Dark mode follows the global `theme` toolbar (story-level `globals`).',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg border border-gray-200 bg-white p-4 sm:p-6 dark:border-gray-700 dark:bg-gray-800">
        <Story />
      </div>
    ),
  ],
  args: {
    live: false,
    totals: feedbackTotals({
      live: { green: 18, yellow: 4, red: 1 },
      cards: { greenCount: 6, yellowCount: 1, redCount: 0 },
    }),
    comments: [
      {
        id: 'feedbackResponse-1',
        colour: 'green',
        comment: 'Loved the war stories. More of those next year, please!',
        submittedAt: '2026-10-27T09:41:00.000Z',
        flagged: false,
      },
      {
        id: 'feedbackResponse-2',
        colour: 'red',
        comment:
          'I came for the hands-on part described in the abstract and it never happened. The first half was a product pitch.\n\nThe Q&A was good though.',
        submittedAt: '2026-10-27T09:47:00.000Z',
        flagged: false,
      },
      {
        id: 'feedbackResponse-3',
        colour: 'red',
        comment: 'The speaker is clearly an idiot.',
        submittedAt: '2026-10-27T09:52:00.000Z',
        flagged: true,
      },
    ],
    onFlag: fn(async () => ({ flagged: true })),
  },
} satisfies Meta<typeof FeedbackResultsView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Dark: Story = { globals: { theme: 'dark' } }

/** Phone width: three tiles side by side, a long comment wraps. */
export const Phone: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

export const PhoneDark: Story = { ...Phone, globals: { theme: 'dark' } }

/** The flag asks first: a speaker cannot take a flag back. */
export const FlagConfirming: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // A flagged comment shows the marker and offers no Flag.
    const flaggedItem = canvas
      .getByText('The speaker is clearly an idiot.')
      .closest('li')!
    expect(
      within(flaggedItem).getByText('Flagged for organizers'),
    ).toBeVisible()
    expect(
      within(flaggedItem).queryByRole('button', { name: /flag/i }),
    ).toBeNull()

    const flags = canvas.getAllByRole('button', { name: 'Flag' })
    expect(flags).toHaveLength(2)
    await userEvent.click(flags[1])
    expect(canvas.getByText(/Flag this comment for organizers\?/)).toBeVisible()
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: 'Flag for organizers' }),
      ).toHaveFocus(),
    )
    expect(args.onFlag).not.toHaveBeenCalled()
  },
}

export const FlagConfirmingDark: Story = {
  ...FlagConfirming,
  globals: { theme: 'dark' },
}

export const FlagConfirmingPhone: Story = {
  ...FlagConfirming,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

/** Confirmed: the comment is flagged, focus lands on its marker. */
export const FlagConfirmed: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole('button', { name: 'Flag' })[0])
    await userEvent.click(
      canvas.getByRole('button', { name: 'Flag for organizers' }),
    )
    expect(args.onFlag).toHaveBeenCalledTimes(1)
    expect(args.onFlag).toHaveBeenCalledWith('feedbackResponse-1')
    const item = canvas.getByText(/Loved the war stories/).closest('li')!
    await waitFor(() =>
      expect(within(item).getByText('Flagged for organizers')).toHaveFocus(),
    )
    expect(within(item).queryByRole('button')).toBeNull()
  },
}

/** Cancel asks nothing and puts focus back on Flag. */
export const FlagCancelled: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole('button', { name: 'Flag' })[0])
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }))
    expect(canvas.queryByText(/Flag this comment for organizers\?/)).toBeNull()
    await waitFor(() =>
      expect(canvas.getAllByRole('button', { name: 'Flag' })[0]).toHaveFocus(),
    )
    expect(args.onFlag).not.toHaveBeenCalled()
  },
}

/** The results as the section holds them: a flag and an organizer's Keep. */
function FlagThenKeep(args: React.ComponentProps<typeof FeedbackResultsView>) {
  const [comments, setComments] = useState(args.comments)
  const setFlagged = (flagged: boolean) =>
    setComments((all) =>
      all.map((c) => (c.id === 'feedbackResponse-1' ? { ...c, flagged } : c)),
    )
  return (
    <>
      <FeedbackResultsView
        {...args}
        comments={comments}
        onFlag={async (id) => {
          await args.onFlag?.(id)
          setFlagged(true)
        }}
      />
      <button type="button" onClick={() => setFlagged(false)}>
        Refresh after Keep
      </button>
    </>
  )
}

/**
 * Once a refresh says the comment is flagged, the server's word rules: an
 * organizer's Keep brings Flag back for the speaker who flagged too.
 */
export const FlagThenKept: Story = {
  render: (args) => <FlagThenKeep {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const item = canvas.getByText(/Loved the war stories/).closest('li')!
    await userEvent.click(within(item).getByRole('button', { name: 'Flag' }))
    await userEvent.click(
      canvas.getByRole('button', { name: 'Flag for organizers' }),
    )
    await waitFor(() =>
      expect(within(item).getByText('Flagged for organizers')).toBeVisible(),
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Refresh after Keep' }),
    )
    await waitFor(() =>
      expect(within(item).getByRole('button', { name: 'Flag' })).toBeVisible(),
    )
    expect(within(item).queryByText('Flagged for organizers')).toBeNull()
  },
}

/**
 * A read well after the flag that says it is no longer flagged (an
 * organizer kept it before any refresh saw the flag) rules too.
 */
export const FlagKeptBeforeAnyRefresh: Story = {
  render: function Render(args) {
    const [updatedAt, setUpdatedAt] = useState(0)
    return (
      <>
        <FeedbackResultsView {...args} updatedAt={updatedAt} />
        <button type="button" onClick={() => setUpdatedAt(Date.now() + 60_000)}>
          Read a minute later
        </button>
      </>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const item = canvas.getByText(/Loved the war stories/).closest('li')!
    await userEvent.click(within(item).getByRole('button', { name: 'Flag' }))
    await userEvent.click(
      canvas.getByRole('button', { name: 'Flag for organizers' }),
    )
    await waitFor(() =>
      expect(within(item).getByText('Flagged for organizers')).toBeVisible(),
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Read a minute later' }),
    )
    await waitFor(() =>
      expect(within(item).getByRole('button', { name: 'Flag' })).toBeVisible(),
    )
  },
}

/** Escape answers the question "no", as in any dialog. */
export const FlagEscaped: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole('button', { name: 'Flag' })[0])
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: 'Flag for organizers' }),
      ).toHaveFocus(),
    )
    await userEvent.keyboard('{Escape}')
    expect(canvas.queryByText(/Flag this comment for organizers\?/)).toBeNull()
    await waitFor(() =>
      expect(canvas.getAllByRole('button', { name: 'Flag' })[0]).toHaveFocus(),
    )
    expect(args.onFlag).not.toHaveBeenCalled()
  },
}

/** A refused or failed flag says so and offers Flag again. */
export const FlagFailed: Story = {
  args: { onFlag: fn(async () => Promise.reject(new Error('NOT_FOUND'))) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole('button', { name: 'Flag' })[0])
    await userEvent.click(
      canvas.getByRole('button', { name: 'Flag for organizers' }),
    )
    expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Couldn’t flag this comment.',
    )
    const item = canvas.getByText(/Loved the war stories/).closest('li')!
    expect(within(item).queryByText('Flagged for organizers')).toBeNull()
    expect(canvas.getAllByRole('button', { name: 'Flag' })).toHaveLength(2)
    // Focus went with the question; it is back on Flag.
    await waitFor(() =>
      expect(within(item).getByRole('button', { name: 'Flag' })).toHaveFocus(),
    )
  },
}

/** Live, before anyone answered. */
export const LiveNoAnswersYet: Story = {
  args: {
    live: true,
    totals: feedbackTotals({ live: { green: 0, yellow: 0, red: 0 } }),
    comments: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Live')).toBeVisible()
    expect(
      canvas.getByText(
        'No answers yet. They appear here as attendees scan your code.',
      ),
    ).toBeVisible()
    // Nothing to break down without Card Counts.
    expect(
      canvas.queryByRole('button', { name: 'Scanned vs cards' }),
    ).toBeNull()
  },
}

/** Scanned answers only: no breakdown toggle, a single colour fills the bar. */
export const ScannedOnly: Story = {
  args: {
    totals: feedbackTotals({ live: { green: 7, yellow: 0, red: 0 } }),
    comments: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('7 responses · 0 comments')).toBeVisible()
    expect(canvas.getByText('100%')).toBeVisible()
  },
}

/**
 * A keynote's three-digit counts at the narrowest phone: each tile's count
 * and share wrap inside the tile instead of running into the next one.
 */
export const LargeNumbersPhone: Story = {
  args: {
    totals: feedbackTotals({
      live: { green: 128, yellow: 34, red: 9 },
      cards: { greenCount: 40, yellowCount: 6, redCount: 1 },
    }),
  },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    const tiles = Array.from(canvasElement.querySelectorAll('dl > div'))
    expect(tiles).toHaveLength(3)
    for (const tile of tiles) {
      const box = tile.getBoundingClientRect()
      for (const child of Array.from(tile.querySelectorAll('span'))) {
        expect(child.getBoundingClientRect().right).toBeLessThanOrEqual(
          box.right + 0.5,
        )
      }
    }
  },
}
