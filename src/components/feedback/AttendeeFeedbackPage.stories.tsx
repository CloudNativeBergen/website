import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { AttendeeFeedbackPage } from './AttendeeFeedbackPage'

const talk = {
  title: 'Kubernetes for everyone: running clusters nobody has to babysit',
  speakers: ['Ada Lovelace', 'Grace Hopper'],
}

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
          'The attendee page a Feedback Code’s QR opens, `/f/<code>`: the conference logo and one state. The title and speakers appear only for a public talk. The answer buttons are disabled until the Submit action lands (F1c). Dark mode follows the global `theme` toolbar (story-level `globals`).',
      },
    },
  },
  args: {
    logo: { title: 'Cloud Native Days Norway' },
    page: { state: 'open', talk, closesAt: '2026-10-27T09:40:00.000Z' },
  },
} satisfies Meta<typeof AttendeeFeedbackPage>

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(talk.title)).toBeInTheDocument()
    await expect(
      canvas.getByText('Ada Lovelace, Grace Hopper'),
    ).toBeInTheDocument()
    for (const label of ['Loved it', 'It was OK', 'Not for me']) {
      // Not wired yet: present, and refusing the tap.
      await expect(canvas.getByRole('button', { name: label })).toBeDisabled()
    }
    await expect(
      canvas.getByText(/Anonymous\. You can change your answer until/),
    ).toBeInTheDocument()
  },
}

/** Not public yet: the buttons, and nothing about the talk. */
export const OpenNotPublic: Story = {
  args: {
    page: { state: 'open', talk: null, closesAt: '2026-10-27T09:40:00.000Z' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'How was this session?' }),
    ).toBeInTheDocument()
    await expect(canvas.queryByText(talk.title)).toBeNull()
  },
}

export const NotYetOpen: Story = {
  args: {
    page: {
      state: 'not-yet-open',
      talk,
      opensAt: '2026-10-26T09:00:00.000Z',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', {
        name: 'Feedback opens when the session starts',
      }),
    ).toBeInTheDocument()
    await expect(canvas.getByText(/It opens Monday/)).toBeInTheDocument()
  },
}

/** Unscheduled or not public: no start time to give. */
export const NotYetOpenNotPublic: Story = {
  args: { page: { state: 'not-yet-open', talk: null, opensAt: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Scan the code again during the session.'),
    ).toBeInTheDocument()
    await expect(canvas.queryByText(talk.title)).toBeNull()
  },
}

export const Closed: Story = {
  args: { page: { state: 'closed', talk } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', {
        name: 'Feedback for this session has closed',
      }),
    ).toBeInTheDocument()
    await expect(canvas.getByText(/24 hours after a session/)).toBeVisible()
  },
}

export const Unknown: Story = {
  args: { page: { state: 'unknown' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: "This feedback code isn't valid" }),
    ).toBeInTheDocument()
    await expect(canvas.queryAllByRole('button')).toHaveLength(0)
  },
}

export const Unavailable: Story = {
  args: { logo: null, page: { state: 'unavailable' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', {
        name: "Feedback isn't available right now",
      }),
    ).toBeInTheDocument()
  },
}

export const OpenDark: Story = { ...Open, globals: { theme: 'dark' } }

export const NotYetOpenDark: Story = {
  ...NotYetOpen,
  globals: { theme: 'dark' },
}

export const UnknownDark: Story = { ...Unknown, globals: { theme: 'dark' } }
