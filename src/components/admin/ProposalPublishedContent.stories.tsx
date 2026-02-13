import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalPublishedContent } from './ProposalPublishedContent'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { Attachment } from '@/lib/attachment/types'

const mockAttachments: Attachment[] = [
  {
    _type: 'urlAttachment',
    _key: 'att-1',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    attachmentType: 'recording',
    title: 'Session Recording',
    uploadedAt: '2025-11-06T12:00:00Z',
  },
  {
    _type: 'urlAttachment',
    _key: 'att-2',
    url: 'https://speakerdeck.com/alice/kubernetes-talk',
    attachmentType: 'slides',
    title: 'Presentation Slides',
    uploadedAt: '2025-11-06T14:00:00Z',
  },
]

const meta: Meta<typeof ProposalPublishedContent> = {
  title: 'Systems/Proposals/Admin/ProposalPublishedContent',
  component: ProposalPublishedContent,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Post-conference content management panel for accepted/confirmed proposals. Allows organizers to add a video recording URL (YouTube or Vimeo) with inline preview, and manage slide attachments. Only renders when the conference has ended and the proposal is accepted or confirmed.',
      },
    },
  },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <div className="max-w-2xl">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ProposalPublishedContent>

export const WithVideoAndSlides: Story = {
  args: {
    proposalId: 'proposal-1',
    currentVideoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    currentAttachments: mockAttachments,
    status: 'confirmed',
    conferenceEndDate: '2024-11-05',
  },
}

export const NoContentYet: Story = {
  args: {
    proposalId: 'proposal-1',
    currentVideoUrl: null,
    currentAttachments: [],
    status: 'confirmed',
    conferenceEndDate: '2024-11-05',
  },
}

export const AcceptedStatus: Story = {
  args: {
    proposalId: 'proposal-1',
    currentVideoUrl: null,
    currentAttachments: [],
    status: 'accepted',
    conferenceEndDate: '2024-11-05',
  },
}

export const ConferenceNotEnded: Story = {
  args: {
    proposalId: 'proposal-1',
    currentVideoUrl: null,
    currentAttachments: [],
    status: 'confirmed',
    conferenceEndDate: '2099-12-31',
  },
  parameters: {
    docs: {
      description: {
        story:
          'When the conference has not yet ended, this component renders nothing.',
      },
    },
  },
}

export const SubmittedStatus: Story = {
  args: {
    proposalId: 'proposal-1',
    currentVideoUrl: null,
    currentAttachments: [],
    status: 'submitted',
    conferenceEndDate: '2024-11-05',
  },
  parameters: {
    docs: {
      description: {
        story:
          'When the proposal is not accepted or confirmed, this component renders nothing.',
      },
    },
  },
}
