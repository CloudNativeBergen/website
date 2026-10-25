import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { MoveParticipantsModal } from './MoveParticipantsModal'

const meta = {
  title: 'Systems/Workshops/Admin/MoveParticipantsModal',
  component: MoveParticipantsModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Moves the sign-ups of a canceled or withdrawn workshop to a listed one. Seats go first, then the waitlist; those already signed up for the target cannot be picked, and a time clash is shown.',
      },
    },
  },
  args: {
    isOpen: true,
    onClose: fn(),
    onSubmit: fn(),
    onTargetChange: fn(),
    workshopTitle: 'Getting Started with Kubernetes Operators',
    targets: [
      { _id: 'ws-2', title: 'Platform Engineering 101' },
      { _id: 'ws-3', title: 'eBPF Hands-on' },
    ],
    targetId: 'ws-2',
    seatsFree: 1,
    candidates: [
      {
        signupId: 's1',
        userName: 'Ada Lovelace',
        userEmail: 'ada@example.test',
        status: 'confirmed',
        inTarget: false,
        conflict: null,
      },
      {
        signupId: 's2',
        userName: 'Grace Hopper',
        userEmail: 'grace@example.test',
        status: 'confirmed',
        inTarget: false,
        conflict: 'eBPF Hands-on',
      },
      {
        signupId: 's3',
        userName: 'Alan Turing',
        userEmail: 'alan@example.test',
        status: 'waitlist',
        inTarget: true,
        conflict: null,
      },
    ],
  },
} satisfies Meta<typeof MoveParticipantsModal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ args }) => {
    const body = within(document.body)
    await expect(
      await body.findByText('Clashes with eBPF Hands-on'),
    ).toBeInTheDocument()
    await expect(body.getByText('Already signed up')).toBeInTheDocument()
    await expect(
      body.getByText(/1 will be on the waitlist/),
    ).toBeInTheDocument()
    await userEvent.click(body.getByLabelText(/Grace Hopper/))
    await userEvent.click(body.getByRole('button', { name: 'Move 1 person' }))
    await expect(args.onSubmit).toHaveBeenCalledWith(['s1'])
  },
}

export const NoTarget: Story = {
  args: { targetId: '', candidates: undefined, seatsFree: undefined },
}
