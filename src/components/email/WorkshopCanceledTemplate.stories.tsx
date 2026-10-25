import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { WorkshopCanceledTemplate } from './WorkshopCanceledTemplate'

/**
 * The email an organizer sends to everyone signed up for a canceled or
 * withdrawn workshop, from /admin/workshops. Confirmed participants and those
 * on the waitlist get a different first line.
 *
 * Emails are inline-styled HTML with no dark mode, so these render on a fixed
 * light surface deliberately.
 */
const meta = {
  title: 'Systems/Email/Workshop Canceled',
  component: WorkshopCanceledTemplate,
  args: {
    userName: 'Ada Lovelace',
    workshopTitle: 'Getting Started with Kubernetes Operators',
    status: 'confirmed',
    message:
      'The speaker cannot make it to Bergen. We are sorry.\n\nYou are welcome to sign up for another workshop while seats remain.',
    organizer: 'Cloud Native Bergen',
    contactEmail: 'contact@cloudnativebergen.dev',
  },
  parameters: { layout: 'fullscreen', options: { showPanel: false } },
} satisfies Meta<typeof WorkshopCanceledTemplate>

export default meta
type Story = StoryObj<typeof meta>

export const Confirmed: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/You had a seat/),
    ).toBeInTheDocument()
  },
}

export const Waitlist: Story = {
  args: { status: 'waitlist' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/You were on the waitlist/),
    ).toBeInTheDocument()
  },
}
