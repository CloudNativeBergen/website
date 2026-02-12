import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalAttachmentsPanel } from './ProposalAttachmentsPanel'
import { Attachment } from '@/lib/attachment/types'

const mockAttachments: Attachment[] = [
  {
    _type: 'fileAttachment',
    _key: 'file-1',
    file: {
      _type: 'file',
      asset: { _ref: 'file-asset-1', _type: 'reference' },
    },
    attachmentType: 'slides',
    title: 'Talk Slides',
    filename: 'presentation.pdf',
    uploadedAt: '2025-11-01T10:00:00Z',
  },
  {
    _type: 'urlAttachment',
    _key: 'url-1',
    url: 'https://github.com/example/demo',
    attachmentType: 'resource',
    title: 'Demo Code',
    uploadedAt: '2025-11-02T14:00:00Z',
  },
]

const meta: Meta<typeof ProposalAttachmentsPanel> = {
  title: 'Systems/Proposals/ProposalAttachmentsPanel',
  component: ProposalAttachmentsPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Speaker-facing panel for managing slides and attachments. Wraps AttachmentManager with auto-save via tRPC. Shows a warning banner when no slides have been uploaded yet.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-4">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ProposalAttachmentsPanel>

export const NoAttachments: Story = {
  args: {
    proposalId: 'proposal-1',
    initialAttachments: [],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows a yellow warning banner prompting the speaker to upload slides.',
      },
    },
  },
}

export const WithAttachments: Story = {
  args: {
    proposalId: 'proposal-1',
    initialAttachments: mockAttachments,
  },
}

export const ReadOnly: Story = {
  args: {
    proposalId: 'proposal-1',
    initialAttachments: mockAttachments,
    readonly: true,
  },
}
