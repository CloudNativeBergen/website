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
    // Not wired yet (F1c), and the page says so.
    await expect(
      canvas.getByText("Answering isn't available yet."),
    ).toBeInTheDocument()
    const buttons = ['Loved it', 'It was OK', 'Not for me'].map((label) =>
      canvas.getByRole('button', { name: label }),
    )
    for (const button of buttons) {
      // Not wired yet: present, refusing the tap, and saying why.
      await expect(button).toBeDisabled()
      await expect(button).toHaveAccessibleDescription(
        "Answering isn't available yet.",
      )
    }
    // One neutral fill for all three: no option may read as the primary
    // action while none can be chosen.
    const fills = buttons.map((b) => getComputedStyle(b).backgroundColor)
    await expect(new Set(fills).size).toBe(1)
    // No promise to change an answer that cannot be given yet (F1c).
    await expect(
      canvas.getByText(
        'Answers are anonymous. Feedback closes Tuesday 27 October at 10:40.',
      ),
    ).toBeInTheDocument()
  },
}

/** Not public yet: the buttons, and nothing about the talk. */
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
      canvas.getByText('Answers are anonymous.', { exact: true }),
    ).toBeInTheDocument()
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
        level: 2, // under the talk's h1
        name: 'Feedback opens when the session starts',
      }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByText(/It opens on Monday 26 October at 10:00\./),
    ).toBeInTheDocument()
  },
}

/** Unscheduled or not public: no start time to give. */
export const NotYetOpenNotPublic: Story = {
  args: { page: { state: 'not-yet-open', talk: null, opensAt: null } },
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
  args: { page: { state: 'closed', talk } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', {
        level: 2,
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

export const NotYetOpenDark: Story = {
  ...NotYetOpen,
  globals: { theme: 'dark' },
}

export const UnavailableDark: Story = {
  ...Unavailable,
  globals: { theme: 'dark' },
}

export const UnknownDark: Story = { ...Unknown, globals: { theme: 'dark' } }
