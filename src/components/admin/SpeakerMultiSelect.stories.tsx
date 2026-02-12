import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpeakerMultiSelect } from './SpeakerMultiSelect'
import { fn } from 'storybook/test'
import { http, HttpResponse } from 'msw'

const mockSpeakers = [
  {
    _id: 'speaker-1',
    name: 'Anna Hansen',
    title: 'Platform Engineer at TechCorp',
    email: 'anna@techcorp.no',
    image: null,
    slug: 'anna-hansen',
  },
  {
    _id: 'speaker-2',
    name: 'Erik Larsen',
    title: 'SRE Lead at CloudScale',
    email: 'erik@cloudscale.no',
    image: null,
    slug: 'erik-larsen',
  },
  {
    _id: 'speaker-3',
    name: 'Sofia Berg',
    title: 'DevOps Architect',
    email: 'sofia@devops.io',
    image: null,
    slug: 'sofia-berg',
  },
  {
    _id: 'speaker-4',
    name: 'Magnus Olsen',
    title: 'Cloud Native Engineer',
    email: 'magnus@cncf.io',
    image: null,
    slug: 'magnus-olsen',
  },
  {
    _id: 'speaker-5',
    name: 'Ingrid Nilsen',
    title: 'Security Engineer at SecureTech',
    email: 'ingrid@securetech.no',
    image: null,
    slug: 'ingrid-nilsen',
  },
]

const meta: Meta<typeof SpeakerMultiSelect> = {
  title: 'Systems/Speakers/SpeakerMultiSelect',
  component: SpeakerMultiSelect,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A dropdown component for selecting multiple speakers. Used in admin interfaces to assign speakers to proposals. Features search filtering, avatar display, and max speaker limits.',
      },
    },
    msw: {
      handlers: [
        http.get('/api/admin/speakers', () => {
          return HttpResponse.json({ speakers: mockSpeakers })
        }),
      ],
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-md p-4">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SpeakerMultiSelect>

export const Empty: Story = {
  args: {
    selectedSpeakerIds: [],
    onChange: fn(),
    label: 'Speakers',
  },
}

export const WithSelectedSpeakers: Story = {
  args: {
    selectedSpeakerIds: ['speaker-1', 'speaker-2'],
    onChange: fn(),
    label: 'Speakers',
  },
}

export const MaxSpeakersReached: Story = {
  args: {
    selectedSpeakerIds: ['speaker-1', 'speaker-2', 'speaker-3'],
    onChange: fn(),
    maxSpeakers: 3,
    label: 'Speakers',
  },
}

export const Required: Story = {
  args: {
    selectedSpeakerIds: [],
    onChange: fn(),
    label: 'Speakers',
    required: true,
  },
}

export const WithError: Story = {
  args: {
    selectedSpeakerIds: [],
    onChange: fn(),
    label: 'Speakers',
    required: true,
    error: 'At least one speaker is required',
  },
}

export const CustomMaxSpeakers: Story = {
  args: {
    selectedSpeakerIds: ['speaker-1'],
    onChange: fn(),
    maxSpeakers: 2,
    label: 'Co-Presenters',
  },
}

export const SingleSpeaker: Story = {
  args: {
    selectedSpeakerIds: ['speaker-3'],
    onChange: fn(),
    label: 'Primary Speaker',
  },
}
