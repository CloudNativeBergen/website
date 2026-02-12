import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { useState } from 'react'
import SpeakerProfilePreview from './SpeakerProfilePreview'
import { Speaker, Flags } from '@/lib/speaker/types'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'

const mockSpeaker: Speaker = {
  _id: 'speaker-1',
  _rev: '1',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  name: 'Alice Johnson',
  email: 'alice@example.com',
  slug: 'alice-johnson',
  title: 'Senior Platform Engineer at Google Cloud',
  bio: 'Alice is a passionate advocate for cloud native technologies with over 10 years of experience in distributed systems and Kubernetes. She has contributed to several CNCF projects and regularly speaks at conferences worldwide about building resilient, scalable architectures.',
  flags: [Flags.localSpeaker],
  links: [
    'https://linkedin.com/in/alicejohnson',
    'https://twitter.com/alicejohnson',
    'https://github.com/alicejohnson',
  ],
}

const mockSpeakerWithImage: Speaker = {
  ...mockSpeaker,
  image: 'image-abc123-200x200-jpg',
  imageURL: 'https://placehold.co/400x400/EEE/31343C?text=Speaker',
}

const mockSpeakerMinimal: Speaker = {
  _id: 'speaker-minimal',
  _rev: '1',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  name: 'Bob Smith',
  email: 'bob@example.com',
  slug: 'bob-smith',
}

const createMockTalk = (
  id: string,
  title: string,
  format: Format = Format.presentation_45,
): ProposalExisting => ({
  _id: id,
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  title,
  description: convertStringToPortableTextBlocks(
    'This talk explores the key patterns and practices for building modern cloud native applications. We will cover containerization, orchestration, and observability strategies that help teams deliver reliable software at scale.',
  ),
  language: Language.english,
  format,
  level: Level.intermediate,
  audiences: [Audience.developer, Audience.operator],
  status: Status.confirmed,
  outline: '',
  topics: [],
  tos: true,
  speakers: [mockSpeaker],
  conference: { _id: 'conf-2025', _ref: 'conf-2025', _type: 'reference' },
})

const mockTalks: ProposalExisting[] = [
  createMockTalk(
    'talk-1',
    'Building Scalable Microservices with Kubernetes',
    Format.presentation_45,
  ),
  createMockTalk('talk-2', 'Observability Best Practices', Format.lightning_10),
]

const meta = {
  title: 'Systems/Speakers/SpeakerProfilePreview',
  component: SpeakerProfilePreview,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Modal dialog showing a full speaker profile preview. Displays speaker photo, bio, social links, Bluesky feed (if available), and their talks with detailed metadata.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SpeakerProfilePreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    isOpen: true,
    onClose: fn(),
    speaker: mockSpeaker,
    talks: mockTalks,
  },
}

export const WithImage: Story = {
  args: {
    isOpen: true,
    onClose: fn(),
    speaker: mockSpeakerWithImage,
    talks: mockTalks,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Speaker with a profile image. The image is loaded from Sanity CDN.',
      },
    },
  },
}

export const MinimalProfile: Story = {
  args: {
    isOpen: true,
    onClose: fn(),
    speaker: mockSpeakerMinimal,
    talks: [],
  },
  parameters: {
    docs: {
      description: {
        story:
          'A speaker with minimal information - just name and email, no bio, title, links, or talks.',
      },
    },
  },
}

export const NoTalks: Story = {
  args: {
    isOpen: true,
    onClose: fn(),
    speaker: mockSpeaker,
    talks: [],
  },
  parameters: {
    docs: {
      description: {
        story: 'Speaker profile without any scheduled talks.',
      },
    },
  },
}

export const MultipleTalks: Story = {
  args: {
    isOpen: true,
    onClose: fn(),
    speaker: mockSpeaker,
    talks: [
      ...mockTalks,
      createMockTalk(
        'talk-3',
        'Hands-on Kubernetes Workshop',
        Format.workshop_120,
      ),
    ],
  },
  parameters: {
    docs: {
      description: {
        story: 'Speaker with three talks of different formats.',
      },
    },
  },
}

export const Closed: Story = {
  args: {
    isOpen: false,
    onClose: fn(),
    speaker: mockSpeaker,
    talks: mockTalks,
  },
  parameters: {
    docs: {
      description: {
        story: 'Modal in closed state - not visible.',
      },
    },
  },
}

export const Interactive: Story = {
  args: {
    isOpen: false,
    onClose: fn(),
    speaker: mockSpeaker,
    talks: mockTalks,
  },
  render: () => {
    const InteractiveDemo = () => {
      const [isOpen, setIsOpen] = useState(false)
      return (
        <div className="p-8">
          <button
            onClick={() => setIsOpen(true)}
            className="rounded-lg bg-brand-cloud-blue px-4 py-2 text-white hover:bg-brand-cloud-blue/90"
          >
            Preview Speaker Profile
          </button>
          <SpeakerProfilePreview
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            speaker={mockSpeaker}
            talks={mockTalks}
          />
        </div>
      )
    }
    return <InteractiveDemo />
  },
  parameters: {
    docs: {
      description: {
        story:
          'Interactive demo showing how the modal opens and closes. Click the button to open the preview.',
      },
    },
  },
}
