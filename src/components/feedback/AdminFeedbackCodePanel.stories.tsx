import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { delay, http, HttpResponse } from 'msw'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { AdminFeedbackCodePanel } from './AdminFeedbackCodePanel'

const READ = '/api/trpc/sessionFeedback.adminCode'
const MINT = '/api/trpc/sessionFeedback.mintCode'

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
const noCode = { code: null, url: null, window: before, mayMint: true }
const withCode = { code: 'k7m2qx', url: URL, window: before, mayMint: false }

const meta = {
  title: 'Systems/Proposals/Session Feedback/AdminFeedbackCodePanel',
  component: AdminFeedbackCodePanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A talk’s Feedback Code in the sidebar of `/admin/proposals/[id]` (#1459). Reads `sessionFeedback.adminCode`, which never mints; Mint Feedback Code calls `sessionFeedback.mintCode`. Shows the speaker’s QR panel once the talk has a code, worded for organizers. Dark mode follows the global `theme` toolbar (story-level `globals`).',
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
    (Story) => (
      <div className="w-full max-w-96 p-4">
        <Story />
      </div>
    ),
  ],
  args: { talkId: 'talk-1', title: 'Kubernetes: the hard parts' },
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
