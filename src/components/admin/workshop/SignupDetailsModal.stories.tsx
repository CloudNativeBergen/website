import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { SignupDetailsModal } from './SignupDetailsModal'
import { WorkshopSignupStatus } from '@/lib/workshop/types'
import { Level } from '@/lib/proposal/types'

const baseSignup = {
  _rev: '1',
  _type: 'workshopSignup' as const,
  _createdAt: '2025-01-10T08:00:00Z',
  _updatedAt: '2025-01-10T08:00:00Z',
  userWorkOSId: 'user_abc',
  experienceLevel: Level.intermediate,
  operatingSystem: 'macos' as const,
  workshop: { _type: 'reference' as const, _ref: 'ws-1' },
  conference: { _type: 'reference' as const, _ref: 'conf-1' },
  signedUpAt: '2025-01-10T08:00:00Z',
}

const confirmedSignups = [
  {
    ...baseSignup,
    _id: 'signup-1',
    userName: 'Alice Johnson',
    userEmail: 'alice@example.com',
    status: WorkshopSignupStatus.CONFIRMED,
    confirmedAt: '2025-01-11T10:00:00Z',
  },
  {
    ...baseSignup,
    _id: 'signup-2',
    userName: 'Bob Smith',
    userEmail: 'bob@example.com',
    status: WorkshopSignupStatus.CONFIRMED,
    _createdAt: '2025-01-11T09:00:00Z',
    signedUpAt: '2025-01-11T09:00:00Z',
  },
  {
    ...baseSignup,
    _id: 'signup-3',
    userName: 'Charlie Brown',
    userEmail: 'charlie@example.com',
    status: WorkshopSignupStatus.CONFIRMED,
    _createdAt: '2025-01-12T14:00:00Z',
    signedUpAt: '2025-01-12T14:00:00Z',
  },
]

const waitlistSignups = [
  {
    ...baseSignup,
    _id: 'signup-4',
    userName: 'Diana Prince',
    userEmail: 'diana@example.com',
    status: WorkshopSignupStatus.WAITLIST,
    _createdAt: '2025-01-13T11:00:00Z',
    signedUpAt: '2025-01-13T11:00:00Z',
  },
  {
    ...baseSignup,
    _id: 'signup-5',
    userName: 'Eve Torres',
    userEmail: 'eve@example.com',
    status: WorkshopSignupStatus.WAITLIST,
    _createdAt: '2025-01-14T16:00:00Z',
    signedUpAt: '2025-01-14T16:00:00Z',
  },
]

const meta = {
  title: 'Systems/Proposals/Admin/Workshop/SignupDetailsModal',
  component: SignupDetailsModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Modal showing a table of workshop signups filtered by status. Admin can confirm waitlisted participants or delete signups.',
      },
    },
  },
  args: {
    onClose: fn(),
    onConfirmSignup: fn(),
    onDeleteSignup: fn(),
  },
} satisfies Meta<typeof SignupDetailsModal>

export default meta
type Story = StoryObj<typeof meta>

export const Confirmed: Story = {
  args: {
    isOpen: true,
    workshopTitle: 'Getting Started with Kubernetes',
    status: WorkshopSignupStatus.CONFIRMED,
    signups: confirmedSignups,
  },
}

export const Waitlist: Story = {
  args: {
    isOpen: true,
    workshopTitle: 'Getting Started with Kubernetes',
    status: WorkshopSignupStatus.WAITLIST,
    signups: waitlistSignups,
  },
}

export const Empty: Story = {
  args: {
    isOpen: true,
    workshopTitle: 'Advanced Terraform Workshop',
    status: WorkshopSignupStatus.CONFIRMED,
    signups: [],
  },
}

export const Confirming: Story = {
  args: {
    isOpen: true,
    workshopTitle: 'Cloud Security Fundamentals',
    status: WorkshopSignupStatus.WAITLIST,
    signups: waitlistSignups,
    isConfirming: true,
  },
}
