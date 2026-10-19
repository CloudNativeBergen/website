import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { delay, http, HttpResponse } from 'msw'
import { expect, userEvent, within } from 'storybook/test'
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
  // The admin talk page's sidebar is 24rem wide (`lg:w-96`) with p-4.
  decorators: [
    (Story) => (
      <div className="w-96 p-4">
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
export const NotFound: Story = {
  parameters: {
    msw: { handlers: [http.get(READ, () => failWith('NOT_FOUND', 404))] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.findByRole('region', { name: 'Feedback Code' }),
    ).rejects.toThrow()
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
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
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
