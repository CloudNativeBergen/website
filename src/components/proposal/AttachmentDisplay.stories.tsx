import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AttachmentDisplay } from './AttachmentDisplay'
import type { Attachment } from '@/lib/attachment/types'

const slidesAttachment: Attachment = {
  _key: 'slides-1',
  _type: 'urlAttachment',
  attachmentType: 'slides',
  title: 'Presentation Slides',
  description: 'PDF version of the talk slides',
  url: 'https://speakerdeck.com/example/my-talk',
}

const recordingAttachment: Attachment = {
  _key: 'recording-1',
  _type: 'urlAttachment',
  attachmentType: 'recording',
  title: 'Talk Recording',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
}

const resourceAttachment: Attachment = {
  _key: 'resource-1',
  _type: 'urlAttachment',
  attachmentType: 'resource',
  title: 'GitHub Repository',
  description: 'Demo code and examples',
  url: 'https://github.com/example/demo',
}

const fileAttachment: Attachment = {
  _key: 'file-1',
  _type: 'fileAttachment',
  attachmentType: 'slides',
  title: 'Downloadable Slides',
  filename: 'talk-slides.pdf',
  url: '/api/files/talk-slides.pdf',
  file: {
    _type: 'file',
    asset: {
      _ref: 'file-abc123',
      _type: 'reference',
    },
  },
}

const meta = {
  title: 'Systems/Proposals/AttachmentDisplay',
  component: AttachmentDisplay,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Displays talk attachments organized by type: slides, recordings (with video embeds), and additional resources.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AttachmentDisplay>

export default meta
type Story = StoryObj<typeof meta>

export const SlidesOnly: Story = {
  args: {
    attachments: [slidesAttachment, fileAttachment],
  },
}

export const RecordingOnly: Story = {
  args: {
    attachments: [recordingAttachment],
  },
}

export const ResourcesOnly: Story = {
  args: {
    attachments: [resourceAttachment],
  },
}

export const AllTypes: Story = {
  args: {
    attachments: [
      slidesAttachment,
      fileAttachment,
      recordingAttachment,
      resourceAttachment,
    ],
  },
}

export const WithoutVideoEmbed: Story = {
  args: {
    attachments: [recordingAttachment],
    showVideos: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'With video embedding disabled - shows recording as a link instead.',
      },
    },
  },
}

export const MultipleRecordings: Story = {
  args: {
    attachments: [
      {
        _key: 'recording-1',
        _type: 'urlAttachment',
        attachmentType: 'recording',
        title: 'Full Session Recording',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
      {
        _key: 'recording-2',
        _type: 'urlAttachment',
        attachmentType: 'recording',
        title: 'Q&A Session',
        url: 'https://vimeo.com/123456789',
      },
    ],
  },
}

export const MultipleResources: Story = {
  args: {
    attachments: [
      resourceAttachment,
      {
        _key: 'resource-2',
        _type: 'urlAttachment',
        attachmentType: 'resource',
        title: 'Blog Post',
        description: 'Deep dive article on the topic',
        url: 'https://blog.example.com/my-talk',
      },
      {
        _key: 'resource-3',
        _type: 'urlAttachment',
        attachmentType: 'resource',
        title: 'Companion Documentation',
        url: 'https://docs.example.com',
      },
    ],
  },
}

export const Empty: Story = {
  args: {
    attachments: [],
  },
  parameters: {
    docs: {
      description: {
        story: 'Returns null when there are no attachments.',
      },
    },
  },
}
