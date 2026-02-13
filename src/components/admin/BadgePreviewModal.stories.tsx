import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { BadgePreviewModal } from './BadgePreviewModal'

const mockBadge = {
  _id: 'badge-1',
  _createdAt: '2025-01-15T10:00:00Z',
  _updatedAt: '2025-01-15T10:00:00Z',
  badgeId: 'urn:uuid:a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  speaker: {
    _id: 'speaker-1',
    _rev: '1',
    _createdAt: '2024-06-01T00:00:00Z',
    _updatedAt: '2024-06-01T00:00:00Z',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    slug: 'alice-johnson',
    image: undefined,
  },
  conference: {
    _id: 'conf-1',
    _rev: '1',
    _type: 'conference' as const,
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    title: 'Cloud Native Days Norway 2025',
  },
  badgeType: 'speaker' as const,
  issuedAt: '2025-01-15T10:00:00Z',
  badgeJson: JSON.stringify(
    {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      type: ['VerifiableCredential', 'OpenBadgeCredential'],
      issuer: {
        id: 'https://cloudnativedays.no',
        type: ['Profile'],
        name: 'Cloud Native Days Norway',
      },
      credentialSubject: {
        type: ['AchievementSubject'],
        achievement: {
          type: ['Achievement'],
          name: 'Speaker Badge',
          description: 'Presented at Cloud Native Days Norway 2025',
        },
      },
    },
    null,
    2,
  ),
  emailSent: true,
  emailSentAt: '2025-01-15T10:05:00Z',
  emailId: 'msg_abc123',
  verificationUrl: 'https://cloudnativedays.no/badges/verify/a1b2c3d4',
}

const meta = {
  title: 'Systems/Speakers/Admin/BadgePreviewModal',
  component: BadgePreviewModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Modal for previewing an issued OpenBadge. Shows the badge SVG, metadata (recipient, conference, type, date), email delivery status, and the full OpenBadges 3.0 JSON credential.',
      },
    },
  },
  args: {
    onClose: fn(),
  },
} satisfies Meta<typeof BadgePreviewModal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    isOpen: true,
    badge: mockBadge as never,
  },
}

export const EmailNotSent: Story = {
  args: {
    isOpen: true,
    badge: {
      ...mockBadge,
      emailSent: false,
      emailSentAt: undefined,
      emailId: undefined,
    } as never,
  },
}

export const EmailError: Story = {
  args: {
    isOpen: true,
    badge: {
      ...mockBadge,
      emailSent: false,
      emailError: 'Recipient email address bounced: alice@example.com',
    } as never,
  },
}
