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

/**
 * Submit as the server answers it: the colour, and the comment as STORED: a
 * colour-only tap leaves it as it was, `''` empties it. One instance per
 * story that sends anything, so no story depends on another's run.
 */
const answeringServer = (stored: string | null = null) => {
  let comment = stored
  return fn<SubmitAnswer>(async (colour, sent) => {
    if (sent !== undefined) comment = sent.trim() || null
    return { state: 'answered', colour, comment, talk }
  })
}
const submitAnswered = answeringServer()

const openPage = {
  state: 'open',
  talk,
  closesAt: '2026-10-27T09:40:00.000Z',
} as const

/** Delete my answer while the window is open: the open form again. */
const removeToOpen = fn<DeleteAnswer>(async () => ({
  deleted: true,
  page: openPage,
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

/** Tap Delete my answer, then confirm: the two steps of §7.2's Delete (decided in review). */
async function confirmDelete(canvas: ReturnType<typeof within>) {
  await userEvent.click(
    canvas.getByRole('button', { name: 'Delete my answer' }),
  )
  await userEvent.click(canvas.getByRole('button', { name: 'Delete' }))
}

/** The comment form's own status line. */
const formStatus = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('form [role="status"]')!

/**
 * 320 x 568 with the root font size doubled: 200 % text, as a browser's text
 * zoom gives it. Undone after the story, so it never leaks into the next.
 */
const largeText = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  beforeEach: () => {
    document.documentElement.style.fontSize = '200%'
    return () => {
      document.documentElement.style.fontSize = ''
    }
  },
} satisfies Story

/**
 * App geometry: drop the Storybook decorator's padding between the canvas
 * and the page, so the page is as wide as the viewport, as in the app.
 */
function flattenToApp(canvasElement: HTMLElement) {
  let el =
    canvasElement.querySelector<HTMLElement>('[data-shell-fit]')?.parentElement
  while (el && el !== canvasElement) {
    el.style.padding = '0'
    el.style.margin = '0'
    el = el.parentElement
  }
}

/**
 * Every word of every answer label on ONE line, inside its button: a label
 * may wrap between words, never inside one (overflow-wrap breaks a word
 * that is wider than its line, so no-overflow alone proves nothing).
 */
async function expectWholeWords(buttons: HTMLElement[]) {
  for (const button of buttons) {
    const text = button.querySelector('span')!.firstChild as Text
    // The inner edge: text in the button's padding is already a spill.
    const edge =
      button.getBoundingClientRect().right -
      parseFloat(getComputedStyle(button).paddingRight)
    for (const match of text.data.matchAll(/\S+/g)) {
      const range = document.createRange()
      range.setStart(text, match.index)
      range.setEnd(text, match.index + match[0].length)
      const rects = [...range.getClientRects()].filter((r) => r.width > 0)
      const lines = new Set(rects.map((r) => Math.round(r.top))).size
      await expect({ word: match[0], lines }).toEqual({
        word: match[0],
        lines: 1,
      })
      for (const r of rects) await expect(r.right).toBeLessThanOrEqual(edge)
    }
  }
}

const answerButtons = (canvas: ReturnType<typeof within>) =>
  ['Loved it', 'It was OK', 'Not for me'].map((name) =>
    canvas.getByRole('button', { name }),
  )

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
    // Announced: focus moves to the thank-you, whose description names the
    // answer, so a screen reader hears what was recorded.
    await waitFor(() => expect(thanks).toHaveFocus())
    await expect(thanks).toHaveAccessibleDescription('You answered Loved it.')
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
    await expect(back.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
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
    await expect(thanks).toHaveAccessibleDescription('You answered Loved it.')
    await expect(
      canvas.getByLabelText('Comment for the speaker (optional)'),
    ).toHaveValue('Great talk, the live demo made it click.')
    await expect(canvas.getByText('40/1,000')).toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Update comment' }),
    ).toBeInTheDocument()
  },
}

/**
 * Change answer: the grid opens as a named group with focus on its first
 * button; a tap is Submit with the COLOUR ONLY, so the stored comment is
 * untouched whatever this tab believes, and an unsent draft stays a draft.
 */
export const ChangeAnswer: Story = {
  args: {
    page: answeredPage,
    // The server answers with the comment as STORED: the saved one.
    submit: fn<SubmitAnswer>(async (colour) => ({
      state: 'answered',
      colour,
      comment: answeredPage.comment,
      talk,
    })),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByLabelText('Comment for the speaker (optional)')
    await userEvent.clear(box)
    await userEvent.type(box, 'draft, not sent')
    await userEvent.click(canvas.getByRole('button', { name: 'Change answer' }))
    const group = canvas.getByRole('group', { name: 'Pick a new answer' })
    const loved = within(group).getByRole('button', { name: 'Loved it' })
    await waitFor(() => expect(document.activeElement).toBe(loved))
    await expect(loved).toHaveAttribute('aria-pressed', 'true')
    await expect(
      canvas.getByRole('button', { name: 'Not for me' }),
    ).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(canvas.getByRole('button', { name: 'Not for me' }))
    await expect(args.submit).toHaveBeenCalledTimes(1)
    await expect(args.submit.mock.calls[0]).toEqual(['red'])
    const thanks = await canvas.findByRole('heading', {
      level: 2,
      name: 'Thanks!',
    })
    await waitFor(() =>
      expect(thanks).toHaveAccessibleDescription('You answered Not for me.'),
    )
    // The grid is gone again; the heading, naming the new answer, has focus.
    await expect(canvas.queryByRole('button', { name: 'Loved it' })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(thanks))
    // The focused heading names the answer: the status line stays quiet.
    await expect(formStatus(canvasElement)).toHaveTextContent('')
    await expect(box).toHaveValue('draft, not sent')
    await expect(
      canvas.getByRole('button', { name: 'Update comment' }),
    ).toBeInTheDocument()
  },
}

/**
 * THE STALE TAB (adversarial round 2): this tab believes there is no comment,
 * another tab sent one. A colour change brings the stored comment back; the
 * untouched box follows it, and Update comment re-sends THAT comment rather
 * than an empty box that would erase it.
 */
export const ChangeAnswerStale: Story = {
  args: {
    page: { ...answeredPage, comment: null },
    submit: answeringServer('Great demo'),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByLabelText('Comment for the speaker (optional)')
    await expect(box).toHaveValue('')
    await userEvent.click(canvas.getByRole('button', { name: 'Change answer' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Not for me' }))
    await expect(args.submit.mock.calls[0]).toEqual(['red'])
    await waitFor(() => expect(box).toHaveValue('Great demo'))
    await expect(formStatus(canvasElement)).toHaveTextContent(
      'Showing your saved comment.',
    )
    await expect(
      canvas.getByRole('button', { name: 'Update comment' }),
    ).toBeInTheDocument()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Update comment' }),
    )
    await expect(args.submit).toHaveBeenLastCalledWith('red', 'Great demo')
    await waitFor(() =>
      expect(formStatus(canvasElement)).toHaveTextContent('Comment updated.'),
    )
    await expect(canvas.queryByText('Comment removed.')).toBeNull()
  },
}

/** The grid open: the recorded answer is the pressed one. */
export const Changing: Story = {
  args: { page: answeredPage },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Change answer' }))
    await expect(
      canvas.getByRole('group', { name: 'Pick a new answer' }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Loved it' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(
      canvas.getByRole('button', { name: 'Keep my answer' }),
    ).toBeInTheDocument()
  },
}

/** Keep my answer: the grid closes with nothing sent, and focus returns to Change answer. */
export const ChangeAnswerKept: Story = {
  args: { page: answeredPage },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Change answer' }))
    await userEvent.click(
      canvas.getByRole('button', { name: 'Keep my answer' }),
    )
    await expect(canvas.queryByRole('button', { name: 'Loved it' })).toBeNull()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        canvas.getByRole('button', { name: 'Change answer' }),
      ),
    )
    await expect(args.submit).not.toHaveBeenCalled()
  },
}

/**
 * Send comment: Submit with the current colour and the comment; the status
 * line says so, focus stays on the button (the page was loaded as Answered,
 * nothing was entered by a tap), and editing the box clears the line.
 */
export const SendComment: Story = {
  args: { page: { ...answeredPage, comment: null }, submit: answeringServer() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByLabelText('Comment for the speaker (optional)')
    await userEvent.type(box, 'More of the demo, less of the slides.')
    await expect(canvas.getByText('37/1,000')).toBeInTheDocument()
    const send = canvas.getByRole('button', { name: 'Send comment' })
    await userEvent.click(send)
    await expect(args.submit).toHaveBeenCalledWith(
      'green',
      'More of the demo, less of the slides.',
    )
    await waitFor(() =>
      expect(formStatus(canvasElement)).toHaveTextContent('Comment sent.'),
    )
    const update = canvas.getByRole('button', { name: 'Update comment' })
    await expect(document.activeElement).toBe(update)
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Thanks!' }),
    ).not.toHaveFocus()
    await expect(box).toHaveValue('More of the demo, less of the slides.')
    await expect(canvas.getByText(/You answered/)).toHaveTextContent('Loved it')
    await userEvent.type(box, '!')
    await expect(formStatus(canvasElement)).toHaveTextContent('')
  },
}

/** Emptying a SAVED comment says "removed"; an empty box with nothing saved sends nothing. */
export const CommentRemoved: Story = {
  args: { page: answeredPage, submit: answeringServer(answeredPage.comment) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByLabelText('Comment for the speaker (optional)')
    await userEvent.clear(box)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Update comment' }),
    )
    await expect(args.submit).toHaveBeenCalledWith('green', '')
    await waitFor(() =>
      expect(formStatus(canvasElement)).toHaveTextContent('Comment removed.'),
    )
    // Nothing saved any more: sending the empty box again is not a removal,
    // and the hint is not styled as a success.
    await userEvent.click(canvas.getByRole('button', { name: 'Send comment' }))
    await expect(args.submit).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(formStatus(canvasElement)).toHaveTextContent(
        'Nothing to send: the box is empty.',
      ),
    )
    await expect(formStatus(canvasElement).className).not.toMatch(/green/)
  },
}

/** The counter near the limit: words as well as colour, and the box stops at 1,000. */
export const CommentNearLimit: Story = {
  args: { page: { ...answeredPage, comment: 'x'.repeat(995) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('995/1,000 · 5 left')).toBeInTheDocument()
    const box = canvas.getByLabelText('Comment for the speaker (optional)')
    await userEvent.type(box, 'abcdefgh')
    await expect(box).toHaveValue(`${'x'.repeat(995)}abcde`)
    await expect(
      canvas.getByText('1,000/1,000 · at the limit'),
    ).toBeInTheDocument()
    await expect(
      canvas.getByText('Character limit reached.'),
    ).toBeInTheDocument()
  },
}

/** The counter speaks at 100 left and at the limit, never per keystroke. */
export const CommentCounterAnnouncements: Story = {
  args: { page: { ...answeredPage, comment: 'x'.repeat(898) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByLabelText('Comment for the speaker (optional)')
    const visible = canvas.getByText('898/1,000')
    // The visible counter is not a live region.
    await expect(visible).not.toHaveAttribute('aria-live')
    // The counter's own live region, not the page's (sr-only until a delete).
    const live = canvasElement.querySelector(
      'form p.sr-only[aria-live]:not([role])',
    )!
    await expect(live).toHaveTextContent('')
    await userEvent.type(box, 'a')
    await expect(live).toHaveTextContent('')
    await userEvent.type(box, 'b')
    await expect(live).toHaveTextContent('100 characters left.')
    await expect(canvas.getByText('900/1,000 · 100 left')).toBeInTheDocument()
    await userEvent.type(box, 'c')
    await expect(live).toHaveTextContent('')
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
    await waitFor(() =>
      expect(formStatus(canvasElement)).toHaveTextContent(
        "We couldn't send your comment. Please try again.",
      ),
    )
    await expect(box).toHaveValue('Hello')
  },
}

/** Delete my answer asks first: an inline confirmation, focus on Cancel. */
export const DeleteConfirmation: Story = {
  args: { page: answeredPage },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Delete my answer' }),
    )
    await expect(args.remove).not.toHaveBeenCalled()
    const group = canvas.getByRole('group', {
      name: 'Delete your answer and comment? This can’t be undone.',
    })
    const cancel = within(group).getByRole('button', { name: 'Cancel' })
    await waitFor(() => expect(document.activeElement).toBe(cancel))
    await expect(
      within(group).getByRole('button', { name: 'Delete' }),
    ).toBeInTheDocument()
    await expect(
      canvas.queryByRole('button', { name: 'Delete my answer' }),
    ).toBeNull()
  },
}

/** The armed confirmation closes when another action is taken, and on Escape. */
export const DeleteConfirmationCloses: Story = {
  // Its own server: Update comment sends, and must not feed another story.
  args: { page: answeredPage, submit: answeringServer(answeredPage.comment) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const arm = () =>
      userEvent.click(canvas.getByRole('button', { name: 'Delete my answer' }))
    await arm()
    await userEvent.keyboard('{Escape}')
    await expect(canvas.queryByRole('group')).toBeNull()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        canvas.getByRole('button', { name: 'Delete my answer' }),
      ),
    )
    // Closed by another action: THAT action keeps its own focus rule.
    await arm()
    await userEvent.click(canvas.getByRole('button', { name: 'Change answer' }))
    await expect(canvas.queryByRole('button', { name: 'Cancel' })).toBeNull()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        canvas.getByRole('button', { name: 'Loved it' }),
      ),
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Keep my answer' }),
    )
    await arm()
    const update = canvas.getByRole('button', { name: 'Update comment' })
    await userEvent.click(update)
    await expect(canvas.queryByRole('button', { name: 'Cancel' })).toBeNull()
    await waitFor(() =>
      expect(formStatus(canvasElement)).toHaveTextContent('Comment updated.'),
    )
    await expect(document.activeElement).toBe(update)
    // A colour tap from the open grid, with the confirmation armed.
    await userEvent.click(canvas.getByRole('button', { name: 'Change answer' }))
    await arm()
    await userEvent.click(canvas.getByRole('button', { name: 'Not for me' }))
    await expect(canvas.queryByRole('button', { name: 'Cancel' })).toBeNull()
    const thanks = canvas.getByRole('heading', { level: 2, name: 'Thanks!' })
    await waitFor(() => expect(document.activeElement).toBe(thanks))
    await expect(args.remove).not.toHaveBeenCalled()
  },
}

/** A failed colour change: the error sits under the grid, focus stays on the tapped button, an armed confirmation is closed without taking focus. */
export const ChangeAnswerFails: Story = {
  args: {
    page: answeredPage,
    submit: fn<SubmitAnswer>(async () => ({ state: 'unavailable' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Delete my answer' }),
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Change answer' }))
    const tapped = canvas.getByRole('button', { name: 'It was OK' })
    await userEvent.click(tapped)
    const error = await canvas.findByText(
      "We couldn't confirm your answer. Please try again.",
    )
    await expect(error).toHaveAttribute('role', 'status')
    // Under the grid, above the comment form.
    const form = canvasElement.querySelector('form')!
    await expect(
      error.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await expect(canvas.queryByRole('button', { name: 'Cancel' })).toBeNull()
    await waitFor(() =>
      expect(tapped).toHaveAttribute('aria-disabled', 'false'),
    )
    await expect(document.activeElement).toBe(tapped)
  },
}

/** Keystrokes typed while a send is in flight stay in the box, unsent. */
export const SendCommentWhileTyping: Story = {
  args: {
    page: { ...answeredPage, comment: null },
    submit: fn<SubmitAnswer>(
      (colour, comment) =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                state: 'answered',
                colour,
                comment: comment?.trim() || null,
                talk,
              }),
            400,
          ),
        ),
    ),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByLabelText('Comment for the speaker (optional)')
    await userEvent.type(box, 'Hello')
    await userEvent.click(canvas.getByRole('button', { name: 'Send comment' }))
    await userEvent.type(box, ' world')
    await waitFor(() =>
      expect(formStatus(canvasElement)).toHaveTextContent('Comment sent.'),
    )
    await expect(args.submit).toHaveBeenCalledWith('green', 'Hello')
    // The newer text is still there, and still unsent.
    await expect(box).toHaveValue('Hello world')
    await expect(
      canvas.getByRole('button', { name: 'Update comment' }),
    ).toBeInTheDocument()
  },
}

/**
 * ADVERSARIAL ROUND 4: a stale tab changes its colour on a slow server, and
 * the attendee starts typing a comment while it is in flight. When the change
 * resolves, focus stays in the box (the heading takes it only if focus had
 * not moved since the tap), every keystroke is kept, and the box, which is
 * the attendee's own text now, is not called the saved comment.
 */
export const ChangeAnswerWhileTyping: Story = {
  args: {
    page: { ...answeredPage, comment: null },
    submit: fn<SubmitAnswer>(
      (colour) =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                state: 'answered',
                colour,
                comment: 'Great demo',
                talk,
              }),
            300,
          ),
        ),
    ),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByLabelText('Comment for the speaker (optional)')
    await userEvent.click(canvas.getByRole('button', { name: 'Change answer' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Not for me' }))
    // Every text the comment form's status line shows: a keystroke clears
    // the line, so only a record of all of them can say it never appeared.
    const shown: string[] = []
    const watch = new MutationObserver(() =>
      shown.push(formStatus(canvasElement).textContent ?? ''),
    )
    watch.observe(formStatus(canvasElement), {
      childList: true,
      characterData: true,
      subtree: true,
    })
    const typed = 'the slides were clear and the demo worked'
    // About 1.2 s of typing: it spans the moment the change resolves.
    await userEvent.type(box, typed, { delay: 30 })
    watch.disconnect()
    await expect(args.submit).toHaveBeenCalledTimes(1)
    await expect(args.submit.mock.calls[0]).toEqual(['red'])
    await waitFor(() =>
      expect(
        canvas.getByRole('heading', { level: 2, name: 'Thanks!' }),
      ).toHaveAccessibleDescription('You answered Not for me.'),
    )
    await expect(box).toHaveValue(typed)
    await expect(document.activeElement).toBe(box)
    await expect(shown).not.toContain('Showing your saved comment.')
    // The heading did not take focus, so the status line said the new
    // answer, once, and the keystrokes after it did not clear it.
    await expect(
      shown.filter((t) => t === 'You answered Not for me.'),
    ).toHaveLength(1)
    await expect(formStatus(canvasElement)).toHaveTextContent(
      'You answered Not for me.',
    )
  },
}

/**
 * ADVERSARIAL ROUND 6: Enter on a colour, then Tab to Keep my answer while
 * the change is in flight. Keep unmounts with the grid, so focus has not
 * moved on to anything that stays: the heading takes it, and the status line
 * stays quiet.
 */
export const ChangeAnswerTabToKeep: Story = {
  args: {
    page: answeredPage,
    submit: fn<SubmitAnswer>(
      (colour) =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                state: 'answered',
                colour,
                comment: answeredPage.comment,
                talk,
              }),
            300,
          ),
        ),
    ),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Change answer' }))
    canvas.getByRole('button', { name: 'Not for me' }).focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.tab()
    await expect(document.activeElement).toBe(
      canvas.getByRole('button', { name: 'Keep my answer' }),
    )
    const thanks = canvas.getByRole('heading', { level: 2, name: 'Thanks!' })
    await waitFor(() =>
      expect(thanks).toHaveAccessibleDescription('You answered Not for me.'),
    )
    await waitFor(() => expect(document.activeElement).toBe(thanks))
    await expect(args.submit).toHaveBeenCalledTimes(1)
    await expect(formStatus(canvasElement)).toHaveTextContent('')
  },
}

/**
 * A colour change whose answer could not read the comment back (`undefined`):
 * this tab keeps its comment, and since the box did not change, nothing says
 * it now shows the saved comment.
 */
export const ChangeAnswerCommentUnread: Story = {
  args: {
    page: answeredPage,
    submit: fn<SubmitAnswer>(async (colour) => ({
      state: 'answered',
      colour,
      comment: undefined,
      talk,
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByLabelText('Comment for the speaker (optional)')
    await userEvent.click(canvas.getByRole('button', { name: 'Change answer' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Not for me' }))
    const thanks = await canvas.findByRole('heading', {
      level: 2,
      name: 'Thanks!',
    })
    await waitFor(() =>
      expect(thanks).toHaveAccessibleDescription('You answered Not for me.'),
    )
    await waitFor(() => expect(document.activeElement).toBe(thanks))
    await expect(box).toHaveValue(answeredPage.comment)
    await expect(formStatus(canvasElement)).toHaveTextContent('')
  },
}

/**
 * Sent with spaces around it: the server stores it trimmed, and the box shows
 * the comment as stored, so it keeps following the stored comment.
 */
export const SendCommentTrimmed: Story = {
  args: {
    page: { ...answeredPage, comment: null },
    submit: answeringServer(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByLabelText('Comment for the speaker (optional)')
    await userEvent.type(box, '  hi  ')
    await userEvent.click(canvas.getByRole('button', { name: 'Send comment' }))
    await waitFor(() =>
      expect(formStatus(canvasElement)).toHaveTextContent('Comment sent.'),
    )
    await expect(args.submit).toHaveBeenCalledWith('green', '  hi  ')
    await expect(box).toHaveValue('hi')
    await expect(
      canvas.getByRole('button', { name: 'Update comment' }),
    ).toBeInTheDocument()
  },
}

/**
 * ADVERSARIAL ROUND 5: a send the server only trimmed ("Great talk " from
 * predictive text), then another tab stores its own comment, then this tab
 * changes colour. The box follows the stored comment and says so, so Update
 * cannot overwrite the other tab's words unseen.
 */
export const ChangeAnswerAfterTrimmedSend: Story = {
  args: {
    page: { ...answeredPage, comment: null },
    submit: fn<SubmitAnswer>(async (colour, sent) => ({
      state: 'answered',
      colour,
      // A send is stored trimmed; by the colour change, the other tab's
      // comment is the stored one.
      comment: sent === undefined ? 'Other tab words' : sent.trim() || null,
      talk,
    })),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByLabelText('Comment for the speaker (optional)')
    await userEvent.type(box, 'Great talk ')
    await userEvent.click(canvas.getByRole('button', { name: 'Send comment' }))
    await waitFor(() =>
      expect(formStatus(canvasElement)).toHaveTextContent('Comment sent.'),
    )
    await expect(args.submit).toHaveBeenCalledWith('green', 'Great talk ')
    await userEvent.click(canvas.getByRole('button', { name: 'Change answer' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Not for me' }))
    await waitFor(() => expect(box).toHaveValue('Other tab words'))
    await expect(formStatus(canvasElement)).toHaveTextContent(
      'Showing your saved comment.',
    )
  },
}

/** While a comment is sent, the delete control is held but does not spin. */
export const SendingComment: Story = {
  args: {
    page: answeredPage,
    submit: fn<SubmitAnswer>(() => new Promise(() => {})),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Update comment' }),
    )
    const remove = canvas.getByRole('button', { name: 'Delete my answer' })
    await waitFor(() => expect(remove).toHaveAttribute('aria-disabled', 'true'))
    await expect(remove.querySelector('.animate-spin')).toBeNull()
  },
}

/** Cancel: nothing deleted, focus back on Delete my answer. */
export const DeleteCancelled: Story = {
  args: { page: answeredPage },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Delete my answer' }),
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }))
    await expect(args.remove).not.toHaveBeenCalled()
    const trigger = canvas.getByRole('button', { name: 'Delete my answer' })
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    await expect(canvas.queryByRole('group')).toBeNull()
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
    await confirmDelete(canvas)
    // Feedback for a screen reader too: the group is busy, the button says so.
    const confirm = await canvas.findByRole('button', { name: 'Deleting…' })
    await expect(confirm).toHaveAttribute('aria-disabled', 'true')
    await expect(canvas.getByRole('group')).toHaveAttribute('aria-busy', 'true')
    await expect(
      canvas.getByRole('button', { name: 'Change answer' }),
    ).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(confirm)
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
    await confirmDelete(canvas)
    await expect(args.remove).toHaveBeenCalledTimes(1)
    await expect(
      await canvas.findByText('Your answer has been deleted.'),
    ).toHaveAttribute('role', 'status')
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

/**
 * The page was stale (the cookie had expired, say): the server refused and
 * deleted nothing. The page's current state replaces Answered, with one
 * neutral line that says nothing about why.
 */
export const DeleteRefused: Story = {
  args: {
    page: answeredPage,
    remove: fn<DeleteAnswer>(async () => ({ deleted: false, page: openPage })),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await confirmDelete(canvas)
    await expect(args.remove).toHaveBeenCalledTimes(1)
    const question = await canvas.findByRole('heading', {
      level: 2,
      name: 'How was this session?',
    })
    await waitFor(() => expect(question).toHaveFocus())
    await expect(
      canvas.getByText('There was no answer from this browser to delete.'),
    ).toHaveAttribute('role', 'status')
    await expect(canvas.queryByText(/has been deleted/)).toBeNull()
  },
}

/** Closed and stale: the refusal shows Closed again, with the neutral line. */
export const DeleteRefusedOnClosed: Story = {
  args: {
    page: { state: 'closed', talk, canDelete: true },
    remove: fn<DeleteAnswer>(async () => ({
      deleted: false,
      page: { state: 'closed', talk, canDelete: false },
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await confirmDelete(canvas)
    await expect(
      await canvas.findByText(
        'There was no answer from this browser to delete.',
      ),
    ).toBeInTheDocument()
    await expect(
      canvas.queryByRole('button', { name: 'Delete my answer' }),
    ).toBeNull()
    await expect(canvas.queryByText(/has been deleted/)).toBeNull()
    // The control went away under a notice that stayed: focus on its heading.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        canvas.getByRole('heading', {
          name: 'Feedback for this session has closed',
        }),
      ),
    )
  },
}

/** The delete failed: Answered stays, with a line saying so. */
export const DeleteNotDone: Story = {
  args: {
    page: answeredPage,
    remove: fn<DeleteAnswer>(async () => ({
      deleted: false,
      page: { state: 'unavailable' },
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await confirmDelete(canvas)
    // Inside the confirmation, above its buttons: in view where the tap was.
    const group = canvas.getByRole('group')
    await expect(
      await within(group).findByText(
        "We couldn't delete your answer. Please try again.",
      ),
    ).toHaveAttribute('role', 'status')
    await expect(formStatus(canvasElement)).toHaveTextContent('')
    const confirm = canvas.getByRole('button', { name: 'Delete' })
    await waitFor(() =>
      expect(confirm).toHaveAttribute('aria-disabled', 'false'),
    )
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
    await expect(canvas.queryByText(/deleted/)).toBeNull()
  },
}

/** Closed, and this device answered: Delete my answer asks, then deletes it (R1). */
export const ClosedWithDelete: Story = {
  args: {
    page: { state: 'closed', talk, canDelete: true },
    remove: fn<DeleteAnswer>(async () => ({
      deleted: true,
      page: { state: 'closed', talk, canDelete: false },
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
    // No comment known here: the question covers one anyway.
    await expect(
      canvas.getByRole('group', {
        name: 'Delete your answer and any comment? This can’t be undone.',
      }),
    ).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Delete' }))
    await expect(args.remove).toHaveBeenCalledTimes(1)
    await expect(
      await canvas.findByText('Your answer has been deleted.'),
    ).toBeInTheDocument()
    // Nothing left to delete.
    await expect(
      canvas.queryByRole('button', { name: 'Delete my answer' }),
    ).toBeNull()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        canvas.getByRole('heading', {
          name: 'Feedback for this session has closed',
        }),
      ),
    )
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
      deleted: true,
      page: {
        state: 'not-yet-open',
        talk,
        opensAt: '2026-10-26T15:00:00.000Z',
        canDelete: false,
      },
    })),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await confirmDelete(canvas)
    await expect(args.remove).toHaveBeenCalledTimes(1)
    await expect(
      await canvas.findByText('Your answer has been deleted.'),
    ).toBeInTheDocument()
    await expect(
      canvas.queryByRole('button', { name: 'Delete my answer' }),
    ).toBeNull()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        canvas.getByRole('heading', {
          name: 'Feedback opens when the session starts',
        }),
      ),
    )
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

/** 320 px at 200 % text, in app geometry: the grid's labels keep every word whole. */
export const ChangingLargeText: Story = {
  ...Changing,
  ...largeText,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    flattenToApp(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Change answer' }))
    await expectWholeWords(answerButtons(canvas))
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth,
    )
  },
}

/** The Open form at 320 px and 200 % text, in app geometry: words wrap, never split or clip. */
export const OpenLargeText: Story = {
  ...largeText,
  play: async ({ canvasElement }) => {
    flattenToApp(canvasElement)
    await expectWholeWords(answerButtons(within(canvasElement)))
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth,
    )
  },
}

/** The normal size keeps the icon beside the label: the stacked layout is for large text only. */
export const OpenWholeWords: Story = {
  play: async ({ canvasElement }) => {
    flattenToApp(canvasElement)
    const buttons = answerButtons(within(canvasElement))
    await expectWholeWords(buttons)
    for (const button of buttons) {
      await expect(getComputedStyle(button).flexDirection).toBe('row')
    }
  },
}

export const DeleteConfirmationLargeText: Story = {
  ...DeleteConfirmation,
  ...largeText,
}

/**
 * A failed change at 320 px and 200 % text, the tapped button flush with
 * the bottom of the screen: the failure under the grid is scrolled into
 * view, not left below the fold.
 */
export const ChangeAnswerFailsLargeText: Story = {
  ...largeText,
  args: {
    page: answeredPage,
    submit: fn<SubmitAnswer>(async () => ({ state: 'unavailable' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    flattenToApp(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Change answer' }))
    const tapped = canvas.getByRole('button', { name: 'Not for me' })
    tapped.scrollIntoView({ block: 'end' })
    await userEvent.click(tapped)
    const error = await canvas.findByText(
      "We couldn't confirm your answer. Please try again.",
    )
    await waitFor(() =>
      expect(error.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        window.innerHeight,
      ),
    )
    await expect(document.activeElement).toBe(tapped)
  },
}

export const DeletedDark: Story = { ...Deleted, globals: { theme: 'dark' } }

export const ChangeAnswerStaleDark: Story = {
  ...ChangeAnswerStale,
  globals: { theme: 'dark' },
}

export const DeleteConfirmationDark: Story = {
  ...DeleteConfirmation,
  globals: { theme: 'dark' },
}

export const DeleteRefusedDark: Story = {
  ...DeleteRefused,
  globals: { theme: 'dark' },
}

export const SendCommentDark: Story = {
  ...SendComment,
  globals: { theme: 'dark' },
}

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

export const OpenLargeTextDark: Story = {
  ...OpenLargeText,
  globals: { theme: 'dark' },
}

export const ChangingLargeTextDark: Story = {
  ...ChangingLargeText,
  globals: { theme: 'dark' },
}
