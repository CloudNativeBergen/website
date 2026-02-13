import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { useState } from 'react'
import { SpeakerDetailsForm } from './SpeakerDetailsForm'
import { SpeakerInput, Flags } from '@/lib/speaker/types'
import { ProfileEmail } from '@/lib/profile/types'

const mockEmails: ProfileEmail[] = [
  {
    email: 'alice@gmail.com',
    primary: true,
    verified: true,
    visibility: 'public',
  },
  {
    email: 'alice.work@company.io',
    primary: false,
    verified: true,
    visibility: 'private',
  },
  {
    email: 'alice.dev@github.com',
    primary: false,
    verified: true,
    visibility: 'private',
  },
]

const emptySpeaker: SpeakerInput = {
  name: '',
}

const filledSpeaker: SpeakerInput = {
  name: 'Alice Johnson',
  title: 'Senior Platform Engineer at Google Cloud',
  bio: 'Alice is a passionate advocate for cloud native technologies with over 10 years of experience in distributed systems and Kubernetes.',
  flags: [Flags.localSpeaker],
  links: [
    'https://linkedin.com/in/alicejohnson',
    'https://github.com/alicejohnson',
  ],
  image: 'https://placehold.co/200x200/EEE/31343C?text=AJ',
  consent: {
    dataProcessing: { granted: true, grantedAt: '2024-01-01T00:00:00Z' },
    marketing: { granted: false },
    publicProfile: { granted: true, grantedAt: '2024-01-01T00:00:00Z' },
    photography: { granted: true, grantedAt: '2024-01-01T00:00:00Z' },
  },
}

const meta = {
  title: 'Systems/Speakers/SpeakerDetailsForm',
  component: SpeakerDetailsForm,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Form for collecting and editing speaker details including name, title, bio, photo, social links, speaker flags (local, first-time, diverse, requires funding), and privacy consent checkboxes. Used in both CFP proposal submissions and speaker profile pages.',
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
} satisfies Meta<typeof SpeakerDetailsForm>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    speaker: emptySpeaker,
    setSpeaker: fn(),
    email: 'alice@gmail.com',
    emails: mockEmails,
  },
}

export const FilledOut: Story = {
  args: {
    speaker: filledSpeaker,
    setSpeaker: fn(),
    email: 'alice@gmail.com',
    emails: mockEmails,
  },
  parameters: {
    docs: {
      description: {
        story: 'Form with pre-filled speaker data and consents granted.',
      },
    },
  },
}

export const ProfileMode: Story = {
  args: {
    speaker: filledSpeaker,
    setSpeaker: fn(),
    email: 'alice@gmail.com',
    emails: mockEmails,
    mode: 'profile',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Profile mode shows a streamlined view without the section header. Help text is adjusted for profile editing context.',
      },
    },
  },
}

export const WithoutEmailField: Story = {
  args: {
    speaker: filledSpeaker,
    setSpeaker: fn(),
    showEmailField: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Form without the email dropdown field.',
      },
    },
  },
}

export const WithoutImageUpload: Story = {
  args: {
    speaker: filledSpeaker,
    setSpeaker: fn(),
    email: 'alice@gmail.com',
    emails: mockEmails,
    showImageUpload: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Form without the photo upload section.',
      },
    },
  },
}

export const WithoutLinks: Story = {
  args: {
    speaker: filledSpeaker,
    setSpeaker: fn(),
    email: 'alice@gmail.com',
    emails: mockEmails,
    showLinks: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Form without the social profiles and links section.',
      },
    },
  },
}

export const MinimalForm: Story = {
  args: {
    speaker: emptySpeaker,
    setSpeaker: fn(),
    showEmailField: false,
    showImageUpload: false,
    showLinks: false,
    mode: 'profile',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Minimal form showing only name, title, bio, speaker flags, and consent checkboxes.',
      },
    },
  },
}

export const FirstTimeSpeaker: Story = {
  args: {
    speaker: {
      name: 'Bob Smith',
      title: 'Junior Developer',
      bio: 'First conference talk, excited to share my learning journey!',
      flags: [Flags.firstTimeSpeaker, Flags.requiresTravelFunding],
    },
    setSpeaker: fn(),
    email: 'bob@example.com',
    emails: [
      {
        email: 'bob@example.com',
        primary: true,
        verified: true,
        visibility: 'public',
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Speaker marked as first-time speaker who requires travel funding.',
      },
    },
  },
}

export const DiverseSpeaker: Story = {
  args: {
    speaker: {
      name: 'Carol Williams',
      title: 'Staff Engineer',
      flags: [Flags.diverseSpeaker, Flags.localSpeaker],
    },
    setSpeaker: fn(),
    email: 'carol@example.com',
    emails: [
      {
        email: 'carol@example.com',
        primary: true,
        verified: true,
        visibility: 'public',
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story: 'Speaker from an underrepresented group who is also local.',
      },
    },
  },
}

export const Interactive: Story = {
  args: {
    speaker: emptySpeaker,
    setSpeaker: fn(),
    email: 'alice@gmail.com',
    emails: mockEmails,
  },
  render: (args) => {
    const InteractiveDemo = () => {
      const [speaker, setSpeaker] = useState<SpeakerInput>(args.speaker)

      return (
        <div className="space-y-6">
          <SpeakerDetailsForm
            {...args}
            speaker={speaker}
            setSpeaker={setSpeaker}
            onImageUpload={async (file: File) => {
              await new Promise((resolve) => setTimeout(resolve, 1000))
              return {
                assetId: 'mock-asset-id',
                url: URL.createObjectURL(file),
              }
            }}
            onEmailSelect={async (email: string) => {
              await new Promise((resolve) => setTimeout(resolve, 500))
              console.log('Selected email:', email)
            }}
          />
          <div className="mt-8 rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Form State:
            </h3>
            <pre className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              {JSON.stringify(speaker, null, 2)}
            </pre>
          </div>
        </div>
      )
    }
    return <InteractiveDemo />
  },
  parameters: {
    docs: {
      description: {
        story:
          'Interactive demo showing form state updates as you fill in the fields.',
      },
    },
  },
}
