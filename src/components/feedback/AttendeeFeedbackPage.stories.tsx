import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import {
  AttendeeFeedbackPage,
  type DeleteAnswer,
  type SubmitAnswer,
} from './AttendeeFeedbackPage'

const talk = {
  title: 'Kubernetes for everyone: running clusters nobody has to babysit',
  speakers: ['Ada Lovelace', 'Grace Hopper'],
}

/** Submit as the server answers it: the colour and the trimmed comment. */
const submitAnswered = fn<SubmitAnswer>(async (colour, comment) => ({
  state: 'answered',
  colour,
  comment: comment?.trim() || null,
  talk,
}))

/** Delete my answer while the window is open: the open form again. */
const removeToOpen = fn<DeleteAnswer>(async () => ({
  state: 'open',
  talk,
  closesAt: '2026-10-27T09:40:00.000Z',
}))

const answeredPage = {
  state: 'answered',
  colour: 'green',
  comment: 'Great talk, the live demo made it click.',
  talk,
} as const

const meta = {
  title: 'Systems/Proposals/Session Feedback/AttendeeFeedbackPage',
  component: AttendeeFeedbackPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'phone' },
    docs: {
      description: {
        component:
          'The attendee page a Feedback Code’s QR opens, `/f/<code>`: the conference logo and one state. The title and speakers appear only for a public talk. A tap calls the Submit action (a mock here) and shows the Answered state, the state the code is in now, or a line saying the answer couldn’t be confirmed. From Answered the attendee changes the colour, sends a comment or deletes the answer (the Delete action, a mock here); Delete is also on Closed and Not yet open while the device’s cookie lists the talk. Dark mode follows the global `theme` toolbar (story-level `globals`).',
      },
    },
  },
  args: {
    logo: { title: 'Cloud Native Days Norway' },
    page: { state: 'open', talk, closesAt: '2026-10-27T09:40:00.000Z' },
    submit: submitAnswered,
    remove: removeToOpen,
  },
} satisfies Meta<typeof AttendeeFeedbackPage>

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // The talk is the page's h1; the question sits under it.
    await expect(
      canvas.getByRole('heading', { level: 1, name: talk.title }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'How was this session?' }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByText('Ada Lovelace, Grace Hopper'),
    ).toBeInTheDocument()
    const buttons = ['Loved it', 'It was OK', 'Not for me'].map((label) =>
      canvas.getByRole('button', { name: label }),
    )
    for (const button of buttons) await expect(button).toBeEnabled()
    // Three colours, each with its icon and words: colour is never the only
    // signal.
    const fills = buttons.map((b) => getComputedStyle(b).backgroundColor)
    await expect(new Set(fills).size).toBe(3)
    for (const button of buttons) {
      await expect(button.querySelector('svg')).not.toBeNull()
    }
    await expect(
      canvas.getByText(
        'Anonymous. You can change your answer until Tuesday 27 October at 10:40.',
      ),
    ).toBeInTheDocument()
    await expect(args.submit).not.toHaveBeenCalled()
  },
}

/** Not public yet: the buttons, and nothing about the talk or its times. */
export const OpenNotPublic: Story = {
  args: {
    page: { state: 'open', talk: null, closesAt: null },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'How was this session?' }),
    ).toBeInTheDocument()
    // No closing time for a talk that is not public: it gives the slot away.
    await expect(
      canvas.getByText(
        'Anonymous. You can change your answer until 24 hours after the session ends.',
      ),
    ).toBeInTheDocument()
  },
}

/** A tap: the colour goes to Submit, and the Answered state replaces the form. */
export const Answered: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Loved it' }))
    await expect(args.submit).toHaveBeenCalledTimes(1)
    await expect(args.submit).toHaveBeenCalledWith('green')
    const thanks = await canvas.findByRole('heading', {
      level: 2,
      name: 'Thanks!',
    })
    // Announced: focus moves to the thank-you.
    await waitFor(() => expect(thanks).toHaveFocus())
    await expect(thanks.parentElement).toHaveTextContent(
      'You answered Loved it.',
    )
    // Still under the talk's heading.
    await expect(
      canvas.getByRole('heading', { level: 1, name: talk.title }),
    ).toBeInTheDocument()
    // What Answered offers (§7.2): change, comment, delete, and the way back.
    await expect(
      canvas.getByRole('button', { name: 'Change answer' }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByLabelText('Comment for the speaker (optional)'),
    ).toHaveValue('')
    await expect(canvas.getByText('0/1,000')).toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Send comment' }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Delete my answer' }),
    ).toBeInTheDocument()
    const back = canvas.getByRole('link', { name: 'Back to the programme' })
    // A plain anchor, a full page load: never a client-side navigation that
    // an analytics script on the next page could report.
    await expect(back).toHaveAttribute('href', '/program')
    await expect(canvas.queryByText(/Scan the code again/)).toBeNull()
  },
}

/** A reload after a tap: the server read the device's own answer. No focus move on load. */
export const AnsweredOnLoad: Story = {
  args: { page: answeredPage },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const thanks = canvas.getByRole('heading', { level: 2, name: 'Thanks!' })
    await expect(thanks).not.toHaveFocus()
    await expect(thanks.parentElement).toHaveTextContent(
      'You answered Loved it.',
    )
    await expect(
      canvas.getByLabelText('Comment for the speaker (optional)'),
    ).toHaveValue('Great talk, the live demo made it click.')
    await expect(canvas.getByText('40/1,000')).toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Update comment' }),
    ).toBeInTheDocument()
  },
}

/** Change answer: the three buttons return, the current one pressed; a tap is Submit with the comment. */
export const ChangeAnswer: Story = {
  args: { page: answeredPage },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Change answer' }))
    await expect(
      canvas.getByRole('button', { name: 'Loved it' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(
      canvas.getByRole('button', { name: 'Not for me' }),
    ).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(canvas.getByRole('button', { name: 'Not for me' }))
    await expect(args.submit).toHaveBeenCalledWith(
      'red',
      'Great talk, the live demo made it click.',
    )
    const thanks = await canvas.findByRole('heading', {
      level: 2,
      name: 'Thanks!',
    })
    await waitFor(() =>
      expect(thanks.parentElement).toHaveTextContent(
        'You answered Not for me.',
      ),
    )
    // The grid is gone again, and the heading names the new answer.
    await expect(canvas.queryByRole('button', { name: 'Loved it' })).toBeNull()
    await waitFor(() => expect(thanks).toHaveFocus())
    await expect(
      canvas.getByRole('button', { name: 'Change answer' }),
    ).toBeInTheDocument()
  },
}

/** The grid open: the recorded answer is the pressed one. */
export const Changing: Story = {
  args: { page: answeredPage },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Change answer' }))
    await expect(canvas.getByText('Pick a new answer')).toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Loved it' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(
      canvas.getByRole('button', { name: 'Keep my answer' }),
    ).toBeInTheDocument()
  },
}

/** Keep my answer: the grid closes with nothing sent. */
export const ChangeAnswerKept: Story = {
  args: { page: answeredPage },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Change answer' }))
    await userEvent.click(
      canvas.getByRole('button', { name: 'Keep my answer' }),
    )
    await expect(canvas.queryByRole('button', { name: 'Loved it' })).toBeNull()
    await expect(args.submit).not.toHaveBeenCalled()
  },
}

/** Send comment: Submit with the current colour and the comment; the box now updates. */
export const SendComment: Story = {
  args: { page: { ...answeredPage, comment: null } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByLabelText('Comment for the speaker (optional)')
    await userEvent.type(box, 'More of the demo, less of the slides.')
    await expect(canvas.getByText('36/1,000')).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Send comment' }))
    await expect(args.submit).toHaveBeenCalledWith(
      'green',
      'More of the demo, less of the slides.',
    )
    await expect(await canvas.findByRole('status')).toHaveTextContent(
      'Comment sent.',
    )
    await expect(
      canvas.getByRole('button', { name: 'Update comment' }),
    ).toBeInTheDocument()
    // The comment stays in the box; the answer is unchanged.
    await expect(box).toHaveValue('More of the demo, less of the slides.')
    await expect(canvas.getByText(/You answered/)).toHaveTextContent('Loved it')
  },
}

/** The counter near the limit, and the box stops at 1,000 characters. */
export const CommentNearLimit: Story = {
  args: { page: { ...answeredPage, comment: 'x'.repeat(995) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('995/1,000')).toBeInTheDocument()
    const box = canvas.getByLabelText('Comment for the speaker (optional)')
    await userEvent.type(box, 'abcdefgh')
    await expect(box).toHaveValue(`${'x'.repeat(995)}abcde`)
    await expect(canvas.getByText('1,000/1,000')).toBeInTheDocument()
  },
}

/** The comment could not be saved: the box keeps the text, with a line saying so. */
export const CommentNotSent: Story = {
  args: {
    page: { ...answeredPage, comment: null },
    submit: fn<SubmitAnswer>(async () => ({ state: 'unavailable' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByLabelText('Comment for the speaker (optional)')
    await userEvent.type(box, 'Hello')
    await userEvent.click(canvas.getByRole('button', { name: 'Send comment' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      "We couldn't send your comment. Please try again.",
    )
    await expect(box).toHaveValue('Hello')
    await expect(canvas.queryByRole('status')).toBeNull()
  },
}

/** Delete in flight: one action at a time, nothing disabled under the finger. */
export const Deleting: Story = {
  args: {
    page: answeredPage,
    remove: fn<DeleteAnswer>(() => new Promise(() => {})),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const remove = canvas.getByRole('button', { name: 'Delete my answer' })
    await userEvent.click(remove)
    await waitFor(() => expect(remove).toHaveAttribute('aria-disabled', 'true'))
    await expect(
      canvas.getByRole('button', { name: 'Change answer' }),
    ).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(remove)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Update comment' }),
    )
    await expect(args.remove).toHaveBeenCalledTimes(1)
    await expect(args.submit).not.toHaveBeenCalled()
  },
}

/** Deleted while the window is open: the open form, with a line saying so. */
export const Deleted: Story = {
  args: { page: answeredPage },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Delete my answer' }),
    )
    await expect(args.remove).toHaveBeenCalledTimes(1)
    await expect(await canvas.findByRole('status')).toHaveTextContent(
      'Your answer has been deleted.',
    )
    const question = canvas.getByRole('heading', {
      level: 2,
      name: 'How was this session?',
    })
    await waitFor(() => expect(question).toHaveFocus())
    await expect(canvas.queryByText('Thanks!')).toBeNull()
    await expect(
      canvas.getByRole('button', { name: 'Loved it' }),
    ).toBeInTheDocument()
  },
}

/** The delete failed: Answered stays, with a line saying so. */
export const DeleteNotDone: Story = {
  args: {
    page: answeredPage,
    remove: fn<DeleteAnswer>(async () => ({ state: 'unavailable' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const remove = canvas.getByRole('button', { name: 'Delete my answer' })
    await userEvent.click(remove)
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      "We couldn't delete your answer. Please try again.",
    )
    await waitFor(() =>
      expect(remove).toHaveAttribute('aria-disabled', 'false'),
    )
    await expect(remove).toHaveFocus()
    await expect(canvas.getByText('Thanks!')).toBeInTheDocument()
  },
}

/** Closed, and this device answered: Delete my answer on offer (R1), untapped. */
export const ClosedCanDelete: Story = {
  args: { page: { state: 'closed', talk, canDelete: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', { name: 'Delete my answer' }),
    ).toBeInTheDocument()
    await expect(canvas.queryByRole('status')).toBeNull()
  },
}

/** Closed, and this device answered: Delete my answer deletes it (R1). */
export const ClosedWithDelete: Story = {
  args: {
    page: { state: 'closed', talk, canDelete: true },
    remove: fn<DeleteAnswer>(async () => ({
      state: 'closed',
      talk,
      canDelete: false,
    })),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', {
        level: 2,
        name: 'Feedback for this session has closed',
      }),
    ).toBeInTheDocument()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Delete my answer' }),
    )
    await expect(args.remove).toHaveBeenCalledTimes(1)
    await expect(await canvas.findByRole('status')).toHaveTextContent(
      'Your answer has been deleted.',
    )
    // Nothing left to delete.
    await expect(
      canvas.queryByRole('button', { name: 'Delete my answer' }),
    ).toBeNull()
  },
}

/** Not yet open after the talk moved, and this device answered before the move. */
export const NotYetOpenWithDelete: Story = {
  args: {
    page: {
      state: 'not-yet-open',
      talk,
      opensAt: '2026-10-26T15:00:00.000Z',
      canDelete: true,
    },
    remove: fn<DeleteAnswer>(async () => ({
      state: 'not-yet-open',
      talk,
      opensAt: '2026-10-26T15:00:00.000Z',
      canDelete: false,
    })),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Delete my answer' }),
    )
    await expect(args.remove).toHaveBeenCalledTimes(1)
    await expect(await canvas.findByRole('status')).toHaveTextContent(
      'Your answer has been deleted.',
    )
    await expect(
      canvas.queryByRole('button', { name: 'Delete my answer' }),
    ).toBeNull()
  },
}

/** Feedback closed while the page was open: the tap shows the Closed state. */
export const AnsweredAfterClosing: Story = {
  args: {
    submit: fn<SubmitAnswer>(async () => ({
      state: 'closed',
      talk,
      canDelete: false,
    })),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Not for me' }))
    await expect(args.submit).toHaveBeenCalledWith('red')
    const closed = await canvas.findByRole('heading', {
      name: 'Feedback for this session has closed',
    })
    // The tapped button is gone: focus moves to what replaced it.
    await waitFor(() => expect(closed).toHaveFocus())
    await expect(canvas.queryByText('Thanks!')).toBeNull()
  },
}

/** The save failed: the buttons stay, with a line saying so. */
export const NotSaved: Story = {
  args: {
    submit: fn<SubmitAnswer>(async () => ({ state: 'unavailable' })),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'It was OK' }))
    await expect(args.submit).toHaveBeenCalledWith('yellow')
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      "We couldn't confirm your answer. Please try again.",
    )
    const tapped = canvas.getByRole('button', { name: 'It was OK' })
    await waitFor(() =>
      expect(tapped).toHaveAttribute('aria-disabled', 'false'),
    )
    // Focus stays on the answer that was tapped, not dropped to the page.
    await expect(tapped).toHaveFocus()
    await expect(canvas.queryByText('Thanks!')).toBeNull()
  },
}

/** While the answer is saved: one tap at a time. */
export const Saving: Story = {
  args: {
    submit: fn<SubmitAnswer>(() => new Promise(() => {})),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Loved it' }))
    for (const label of ['Loved it', 'It was OK', 'Not for me']) {
      await waitFor(() =>
        expect(canvas.getByRole('button', { name: label })).toHaveAttribute(
          'aria-disabled',
          'true',
        ),
      )
    }
    // A second tap while the first is saved sends nothing.
    await userEvent.click(canvas.getByRole('button', { name: 'Not for me' }))
    await expect(args.submit).toHaveBeenCalledTimes(1)
  },
}

export const NotYetOpen: Story = {
  args: {
    page: {
      state: 'not-yet-open',
      talk,
      opensAt: '2026-10-26T09:00:00.000Z',
      canDelete: false,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', {
        level: 2, // under the talk's h1
        name: 'Feedback opens when the session starts',
      }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByText(/It opens on Monday 26 October at 10:00\./),
    ).toBeInTheDocument()
    await expect(canvas.queryAllByRole('button')).toHaveLength(0)
  },
}

/** Unscheduled or not public: no start time to give. */
export const NotYetOpenNotPublic: Story = {
  args: {
    page: {
      state: 'not-yet-open',
      talk: null,
      opensAt: null,
      canDelete: false,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', {
        level: 1, // no talk heading, so the state's own is the h1
        name: 'Feedback opens when the session starts',
      }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByText('Scan the code again during the session.'),
    ).toBeInTheDocument()
  },
}

export const Closed: Story = {
  args: { page: { state: 'closed', talk, canDelete: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', {
        level: 2,
        name: 'Feedback for this session has closed',
      }),
    ).toBeInTheDocument()
    await expect(canvas.getByText(/24 hours after a session/)).toBeVisible()
    // Not this device's talk: nothing to delete.
    await expect(canvas.queryAllByRole('button')).toHaveLength(0)
  },
}

export const Unknown: Story = {
  args: { page: { state: 'unknown' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', {
        level: 1,
        name: "This feedback code isn't valid",
      }),
    ).toBeInTheDocument()
    // The conference's own logo heads the page...
    await expect(canvasElement.querySelectorAll('header')).toHaveLength(1)
    await expect(canvas.queryAllByRole('button')).toHaveLength(0)
  },
}

export const Unavailable: Story = {
  args: { logo: null, page: { state: 'unavailable' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', {
        level: 1,
        name: "Feedback isn't available right now",
      }),
    ).toBeInTheDocument()
    // ...but with no conference read there is no logo to show, and the
    // platform's mark on a tenant's domain would be another brand.
    await expect(canvasElement.querySelectorAll('header')).toHaveLength(0)
  },
}

/** The conference was read but its index was not: its own logo still shows. */
export const UnavailableWithLogo: Story = {
  args: { page: { state: 'unavailable' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', {
        level: 1,
        name: "Feedback isn't available right now",
      }),
    ).toBeInTheDocument()
    await expect(canvasElement.querySelectorAll('header')).toHaveLength(1)
  },
}

/** A long unbroken title and many speakers must wrap, never scroll sideways. */
export const LongTitle: Story = {
  parameters: { viewport: { defaultViewport: 'phone' } },
  args: {
    page: {
      state: 'closed',
      canDelete: false,
      talk: {
        title:
          'Supercalifragilisticexpialidocious-observability-for-kubernetes-operators-at-scale',
        speakers: [
          'Ada Lovelace',
          'Grace Hopper',
          'Margaret Hamilton',
          'Katherine Johnson',
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.clientWidth,
    )
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth,
    )
  },
}

export const OpenDark: Story = { ...Open, globals: { theme: 'dark' } }

export const AnsweredDark: Story = { ...Answered, globals: { theme: 'dark' } }

export const AnsweredOnLoadDark: Story = {
  ...AnsweredOnLoad,
  globals: { theme: 'dark' },
}

export const ChangeAnswerDark: Story = {
  ...ChangeAnswer,
  globals: { theme: 'dark' },
}

export const CommentNearLimitDark: Story = {
  ...CommentNearLimit,
  globals: { theme: 'dark' },
}

export const ChangingDark: Story = { ...Changing, globals: { theme: 'dark' } }

export const DeletedDark: Story = { ...Deleted, globals: { theme: 'dark' } }

export const ClosedCanDeleteDark: Story = {
  ...ClosedCanDelete,
  globals: { theme: 'dark' },
}

export const ClosedWithDeleteDark: Story = {
  ...ClosedWithDelete,
  globals: { theme: 'dark' },
}

export const NotSavedDark: Story = { ...NotSaved, globals: { theme: 'dark' } }

export const NotYetOpenDark: Story = {
  ...NotYetOpen,
  globals: { theme: 'dark' },
}

export const UnavailableDark: Story = {
  ...Unavailable,
  globals: { theme: 'dark' },
}

export const UnknownDark: Story = { ...Unknown, globals: { theme: 'dark' } }
