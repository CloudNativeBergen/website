import { useEffect, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { delay, http, HttpResponse } from 'msw'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { AdminFeedbackCodePanel, rotateMessage } from './AdminFeedbackCodePanel'

const READ = '/api/trpc/sessionFeedback.adminCode'
const MINT = '/api/trpc/sessionFeedback.mintCode'
const ROTATE = '/api/trpc/sessionFeedback.rotateCode'

const trpc = (data: unknown) => HttpResponse.json({ result: { data } })
const failWith = (code: string, httpStatus: number) =>
  HttpResponse.json(
    { error: { message: code, code: -32000, data: { code, httpStatus } } },
    { status: httpStatus },
  )

const URL = 'https://2026.cloudnativedays.no/f/k7m2qx'
const before = {
  state: 'before',
  opensAt: '2026-10-26T08:00:00.000Z',
  lastSlotEnd: '2026-10-26T08:40:00.000Z',
  closesAt: '2026-10-27T08:40:00.000Z',
  feedbackVisible: false,
}
const noCode = {
  code: null,
  url: null,
  window: before,
  mayMint: true,
  mayRotate: false,
}
const withCode = {
  code: 'k7m2qx',
  url: URL,
  window: before,
  mayMint: false,
  mayRotate: true,
}

/**
 * The Rotate confirmation is portaled out of the story's root, past the
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

/**
 * Deterministic dates with real timers (AGENTS.md): the clock starts before
 * the fixtures' 2026-10-26 session and runs at real speed, so every story
 * sees the same state on any day.
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
  title: 'Systems/Proposals/Session Feedback/AdminFeedbackCodePanel',
  component: AdminFeedbackCodePanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A talk’s Feedback Code in the sidebar of `/admin/proposals/[id]` (#1459). Reads `sessionFeedback.adminCode`, which never mints; Mint Feedback Code calls `sessionFeedback.mintCode`. Shows the speaker’s QR panel once the talk has a code, worded for organizers, and Rotate Feedback Code (`sessionFeedback.rotateCode`, spec §10.4) where `adminCode` says rotation is possible. Dark mode follows the global `theme` toolbar (story-level `globals`), applied to the document as well because the Rotate confirmation is portaled.',
      },
    },
    msw: {
      handlers: [
        http.get(READ, () => trpc(noCode)),
        http.post(MINT, () =>
          trpc({ code: 'k7m2qx', url: URL, window: before }),
        ),
      ],
    },
  },
  // The admin talk page's sidebar is 24rem wide (`lg:w-96`) with p-4; on a
  // phone it is the full width.
  decorators: [
    (Story, context) => (
      <DocumentTheme dark={context.globals.theme === 'dark'}>
        <div className="w-full max-w-96 p-4">
          <Story />
        </div>
      </DocumentTheme>
    ),
  ],
  args: { talkId: 'talk-1', title: 'Kubernetes: the hard parts' },
  beforeEach: runningClockFrom(new Date('2026-10-17T12:00:00Z')),
} satisfies Meta<typeof AdminFeedbackCodePanel>

export default meta
type Story = StoryObj<typeof meta>

/** No code yet: the organizer mints it, and the QR panel takes its place. */
export const MintsACode: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Mint Feedback Code' }),
    )
    expect(
      await canvas.findByRole('img', { name: 'QR code for the feedback link' }),
    ).toBeVisible()
    expect(canvas.getByText(/send the link to the speaker/)).toBeInTheDocument()
    expect(canvas.getByText(/Opens when the session starts/)).toBeVisible()
    // The button is gone: focus is on the heading, and the change is said.
    expect(canvas.getByRole('heading', { name: 'Feedback Code' })).toHaveFocus()
    expect(canvas.getByText('Feedback Code minted.')).toBeInTheDocument()
  },
}

export const NoCodeYet: Story = {}

export const NoCodeYetDark: Story = { globals: { theme: 'dark' } }

export const HasCode: Story = {
  parameters: { msw: { handlers: [http.get(READ, () => trpc(withCode))] } },
}

export const HasCodeDark: Story = {
  ...HasCode,
  globals: { theme: 'dark' },
}

export const WindowClosed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(READ, () =>
          trpc({
            ...noCode,
            window: { ...before, state: 'closed', feedbackVisible: true },
            mayMint: false,
          }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(
      await canvas.findByText(/the feedback window has closed/),
    ).toBeVisible()
    expect(canvas.queryByRole('button')).toBeNull()
  },
}

/** A version of the talk waits in a scheduled release: no code, and why. */
export const WaitingOnRelease: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(READ, () => trpc(noCode)),
        http.post(MINT, () => trpc({ code: null, url: null, window: before })),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Mint Feedback Code' }),
    )
    expect(
      await canvas.findByText(/waits in a scheduled release/),
    ).toBeVisible()
  },
}

export const MintFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(READ, () => trpc(noCode)),
        http.post(MINT, () => failWith('INTERNAL_SERVER_ERROR', 500)),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Mint Feedback Code' }),
    )
    expect(await canvas.findByRole('alert')).toHaveTextContent(
      'The code could not be minted. Try again.',
    )
  },
}

/** Not a confirmed talk of this conference: the panel is not there at all. */
const notFoundHits = { n: 0 }
export const NotFound: Story = {
  beforeEach: () => {
    notFoundHits.n = 0
  },
  parameters: {
    msw: {
      handlers: [
        http.get(READ, () => {
          notFoundHits.n++
          return failWith('NOT_FOUND', 404)
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(notFoundHits.n).toBe(1))
    await waitFor(() =>
      expect(
        canvas.queryByRole('region', { name: 'Feedback Code' }),
      ).toBeNull(),
    )
  },
}

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(READ, async () => {
          await delay('infinite')
          return trpc(noCode)
        }),
      ],
    },
  },
}

/** On a phone the sidebar stacks below the talk at full width. */
export const HasCodeMobile: Story = {
  ...HasCode,
  parameters: {
    ...HasCode.parameters,
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.ownerDocument.documentElement
    expect(
      await within(canvasElement).findByRole('img', {
        name: 'QR code for the feedback link',
      }),
    ).toBeVisible()
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
  },
}

/**
 * Left up through the session's start: the state moves on by the clock,
 * without asking the server again. The session opens 5 s after the answer.
 */
let opensWhileShownReads = 0
export const OpensWhileShown: Story = {
  beforeEach: () => {
    opensWhileShownReads = 0
  },
  parameters: {
    msw: {
      handlers: [
        http.get(READ, () => {
          opensWhileShownReads++
          const opensAt = Date.now() + 5000
          return trpc({
            ...withCode,
            window: {
              ...before,
              opensAt: new Date(opensAt).toISOString(),
              lastSlotEnd: new Date(opensAt + 40 * 60_000).toISOString(),
              closesAt: new Date(opensAt + 25 * 3_600_000).toISOString(),
            },
          })
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText(/Opens when the session starts/)
    await waitFor(() => canvas.getByText(/Open until/), { timeout: 10000 })
    expect(opensWhileShownReads).toBe(1)
  },
}

/** No code, and the window closes while the page is up: the offer goes. */
export const ClosesWhileShown: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(READ, () => {
          const closesAt = Date.now() + 4000
          return trpc({
            ...noCode,
            window: {
              state: 'open',
              opensAt: new Date(closesAt - 25 * 3_600_000).toISOString(),
              lastSlotEnd: new Date(closesAt - 24 * 3_600_000).toISOString(),
              closesAt: new Date(closesAt).toISOString(),
              feedbackVisible: true,
            },
          })
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(
      await canvas.findByRole('button', { name: 'Mint Feedback Code' }),
    ).toBeVisible()
    await waitFor(() => canvas.getByText(/the feedback window has closed/), {
      timeout: 10000,
    })
    expect(canvas.queryByRole('button')).toBeNull()
  },
}

/**
 * The talk stopped qualifying between load and Mint (unconfirmed, or its last
 * speaker erased): the mint is refused, and the panel says why, in place.
 */
export const MintRefused: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(READ, () => trpc(noCode)),
        http.post(MINT, () => failWith('NOT_FOUND', 404)),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Mint Feedback Code' }),
    )
    const reason = await canvas.findByText(/can no longer get a Feedback Code/)
    expect(reason).toBeVisible()
    // Focus is on the heading: the reason itself is announced.
    expect(reason).toHaveAttribute('aria-live', 'polite')
    expect(canvas.queryByRole('button')).toBeNull()
    expect(canvas.queryByRole('alert')).toBeNull()
    expect(canvas.getByRole('heading', { name: 'Feedback Code' })).toHaveFocus()
  },
}

const ROTATED = 'p4hw7c'
const rotated = {
  code: ROTATED,
  url: `https://2026.cloudnativedays.no/f/${ROTATED}`,
  window: before,
}

/** What each Rotate request sent. */
const rotateBodies: string[] = []

/**
 * Rotate asks first, with the spec’s words (§10.4), then shows the new code.
 * The request names the code the dialog named: only that one is rotated.
 */
export const RotatesTheCode: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(READ, () => trpc(withCode)),
        http.post(ROTATE, async ({ request }) => {
          rotateBodies.push(await request.text())
          return trpc(rotated)
        }),
      ],
    },
  },
  beforeEach: () => {
    rotateBodies.length = 0
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect((await canvas.findAllByText(/k7m2qx/))[0]).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Rotate Feedback Code' }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText('Rotate Feedback Code?'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        '/f/k7m2qx stops working now. Printed sheets and slides showing it will reach a dead page. Existing responses are kept.',
      ),
    ).toBeInTheDocument()
    expect(rotateMessage('k7m2qx')).toBe(
      '/f/k7m2qx stops working now. Printed sheets and slides showing it will reach a dead page. Existing responses are kept.',
    )
    await confirmWith('Rotate')
    expect((await canvas.findAllByText(new RegExp(ROTATED)))[0]).toBeVisible()
    expect(canvas.queryByText(/k7m2qx/)).toBeNull()
    expect(
      canvas.getByText(`Feedback Code rotated. The new code is ${ROTATED}.`),
    ).toBeInTheDocument()
    expect(rotateBodies).toHaveLength(1)
    expect(JSON.parse(rotateBodies[0])).toMatchObject({
      talkId: 'talk-1',
      code: 'k7m2qx',
    })
  },
}

/** The confirmation, open, for a visual check. */
export const RotateAsks: Story = {
  parameters: { msw: { handlers: [http.get(READ, () => trpc(withCode))] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Rotate Feedback Code' }),
    )
    expect(await screen.findByRole('dialog')).toBeVisible()
  },
}

export const RotateAsksDark: Story = {
  ...RotateAsks,
  globals: { theme: 'dark' },
}

/** No rotation offered once the window has closed (§10.4). */
export const NoRotationWindowClosed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(READ, () =>
          trpc({
            ...withCode,
            window: { ...before, state: 'closed', feedbackVisible: true },
            mayRotate: false,
          }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect((await canvas.findAllByText(/k7m2qx/))[0]).toBeVisible()
    expect(
      canvas.queryByRole('button', { name: 'Rotate Feedback Code' }),
    ).toBeNull()
  },
}

/** Refused meanwhile (the window closed, the talk changed): said, offer gone. */
export const RotateRefused: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(READ, () => trpc(withCode)),
        http.post(ROTATE, () => failWith('NOT_FOUND', 404)),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Rotate Feedback Code' }),
    )
    await confirmWith('Rotate')
    expect(await canvas.findByRole('alert')).toHaveTextContent(
      'can no longer be rotated',
    )
  },
}

/**
 * Someone rotated the code since this page loaded: nothing is rotated, the
 * page says so and shows the current code.
 */
export const RotateChangedMeanwhile: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(READ, () => trpc(withCode)),
        http.post(ROTATE, () =>
          HttpResponse.json(
            {
              error: {
                message:
                  'This talk’s code is now w9nn3r: someone changed it since this page loaded. Check it before rotating again.',
                code: -32009,
                data: { code: 'CONFLICT', httpStatus: 409 },
              },
            },
            { status: 409 },
          ),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Rotate Feedback Code' }),
    )
    await confirmWith('Rotate')
    expect(await canvas.findByRole('alert')).toHaveTextContent(
      'someone changed it since this page loaded',
    )
  },
}

/**
 * The rotate request's reply was lost (502), though the rotation landed:
 * the panel reads the code again and shows the new one.
 */
const lostReply = { reads: 0 }
export const RotateReplyLost: Story = {
  beforeEach: () => {
    lostReply.reads = 0
  },
  parameters: {
    msw: {
      handlers: [
        http.get(READ, () =>
          trpc(
            lostReply.reads++ === 0
              ? withCode
              : { ...rotated, mayMint: false, mayRotate: true },
          ),
        ),
        http.post(ROTATE, () => failWith('INTERNAL_SERVER_ERROR', 502)),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Rotate Feedback Code' }),
    )
    await confirmWith('Rotate')
    expect((await canvas.findAllByText(new RegExp(ROTATED)))[0]).toBeVisible()
  },
}

/**
 * The rotation's reply was lost and the read after it failed too: the code
 * on screen may be dead, so it is not offered to print or share until a
 * Retry confirms which code is current.
 */
const unconfirmedReads = { n: 0 }
export const RotateUnconfirmed: Story = {
  beforeEach: () => {
    unconfirmedReads.n = 0
  },
  parameters: {
    msw: {
      handlers: [
        http.get(READ, () =>
          unconfirmedReads.n++ === 0
            ? trpc(withCode)
            : failWith('INTERNAL_SERVER_ERROR', 500),
        ),
        http.post(ROTATE, () => failWith('INTERNAL_SERVER_ERROR', 502)),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Rotate Feedback Code' }),
    )
    await confirmWith('Rotate')
    expect(
      await canvas.findByText(
        'Couldn’t confirm the current code. Retry before printing or sharing it.',
      ),
    ).toBeVisible()
    // Once the read after it has failed too, Retry is offered.
    expect(await canvas.findByRole('button', { name: 'Retry' })).toBeVisible()
    expect(canvas.queryByRole('button', { name: /PNG for slides/ })).toBeNull()
  },
}

export const RotateUnconfirmedDark: Story = {
  ...RotateUnconfirmed,
  globals: { theme: 'dark' },
}
