import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AttachmentManager } from './AttachmentManager'
import { Attachment } from '@/lib/attachment/types'
import { fn } from 'storybook/test'

const mockFileAttachment: Attachment = {
  _type: 'fileAttachment',
  _key: 'file-1',
  file: {
    _type: 'file',
    asset: { _ref: 'file-asset-1', _type: 'reference' },
  },
  attachmentType: 'slides',
  title: 'Conference Presentation Slides',
  description: 'Final version of the talk slides',
  filename: 'kubernetes-talk-slides.pdf',
  uploadedAt: '2025-11-01T10:00:00Z',
}

const mockUrlAttachment: Attachment = {
  _type: 'urlAttachment',
  _key: 'url-1',
  url: 'https://speakerdeck.com/alice/kubernetes-security',
  attachmentType: 'slides',
  title: 'SpeakerDeck Slides',
  uploadedAt: '2025-11-02T14:00:00Z',
}

const mockResourceAttachment: Attachment = {
  _type: 'urlAttachment',
  _key: 'url-2',
  url: 'https://github.com/example/demo-repo',
  attachmentType: 'resource',
  title: 'Demo Repository',
  description: 'Source code used in the live demo',
  uploadedAt: '2025-11-03T09:00:00Z',
}

const meta: Meta<typeof AttachmentManager> = {
  title: 'Systems/Proposals/AttachmentManager',
  component: AttachmentManager,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Manages file and URL attachments for proposals. Supports file upload (PDF, PPTX, PPT, ODP, KEY) via drag-and-drop or file picker, and URL-based attachments. Each attachment has a type (slides, recording, resource), optional title and description. Includes delete confirmation and upload progress.',
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
type Story = StoryObj<typeof AttachmentManager>

export const Empty: Story = {
  args: {
    proposalId: 'proposal-1',
    attachments: [],
    onAttachmentsChange: fn(),
    onDeleteAttachment: fn(),
  },
}

export const WithAttachments: Story = {
  args: {
    proposalId: 'proposal-1',
    attachments: [
      mockFileAttachment,
      mockUrlAttachment,
      mockResourceAttachment,
    ],
    onAttachmentsChange: fn(),
    onDeleteAttachment: fn(),
  },
}

export const WithFileAttachment: Story = {
  args: {
    proposalId: 'proposal-1',
    attachments: [mockFileAttachment],
    onAttachmentsChange: fn(),
    onDeleteAttachment: fn(),
  },
}

export const ReadOnly: Story = {
  args: {
    proposalId: 'proposal-1',
    attachments: [mockFileAttachment, mockUrlAttachment],
    onAttachmentsChange: fn(),
    onDeleteAttachment: fn(),
    readonly: true,
  },
}
