import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { NotifyCanceledModal } from './NotifyCanceledModal'

const meta = {
  title: 'Systems/Workshops/Admin/NotifyCanceledModal',
  component: NotifyCanceledModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Emails everyone still signed up for a canceled or withdrawn workshop, with a message the organizer can edit. Warns when they were already told.',
      },
    },
  },
  args: {
    isOpen: true,
    onClose: fn(),
    onSubmit: fn(),
    workshopTitle: 'Getting Started with Kubernetes Operators',
    confirmedCount: 12,
    waitlistCount: 3,
  },
} satisfies Meta<typeof NotifyCanceledModal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ args }) => {
    const body = within(document.body)
    const message = await body.findByLabelText('Message')
    await userEvent.clear(message)
    await userEvent.type(message, 'Sorry, the speaker is ill.')
    await userEvent.click(body.getByRole('button', { name: 'Email 15 people' }))
    await expect(args.onSubmit).toHaveBeenCalledWith(
      'Sorry, the speaker is ill.',
    )
  },
}

export const AlreadySent: Story = {
  args: { lastSentAt: '2026-10-20T09:30:00Z' },
  play: async () => {
    const body = within(document.body)
    await expect(await body.findByRole('alert')).toHaveTextContent(
      /Already sent/,
    )
    await expect(
      body.getByRole('button', { name: 'Send again' }),
    ).toBeInTheDocument()
  },
}

export const Submitting: Story = { args: { isSubmitting: true } }
