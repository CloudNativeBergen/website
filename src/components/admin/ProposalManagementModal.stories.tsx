import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalManagementModal } from './ProposalManagementModal'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import { Conference } from '@/lib/conference/types'
import { Speaker } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import { fn, userEvent, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { withPortalTheme } from '@/lib/storybook'

const mockTopics: Topic[] = [
  {
    _id: 'topic-1',
    _type: 'topic',
    title: 'Kubernetes',
    color: '326CE5',
    slug: { current: 'kubernetes' },
  },
  {
    _id: 'topic-2',
    _type: 'topic',
    title: 'DevOps',
    color: 'FF6B35',
    slug: { current: 'devops' },
  },
  {
    _id: 'topic-3',
    _type: 'topic',
    title: 'Security',
    color: 'E91E63',
    slug: { current: 'security' },
  },
  {
    _id: 'topic-4',
    _type: 'topic',
    title: 'Observability',
    color: '4CAF50',
    slug: { current: 'observability' },
  },
]

const mockConference: Conference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway 2025',
  organizer: 'Cloud Native Days Norway',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2025-11-05',
  endDate: '2025-11-05',
  cfpStartDate: '2025-06-01',
  cfpEndDate: '2025-08-31',
  cfpNotifyDate: '2025-09-15',
  cfpEmail: 'cfp@cloudnativedays.no',
  sponsorEmail: 'sponsor@cloudnativedays.no',
  programDate: '2025-10-01',
  registrationEnabled: true,
  contactEmail: 'hello@cloudnativedays.no',
  organizers: [],
  domains: ['cloudnativedays.no'],
  formats: [
    Format.lightning_10,
    Format.presentation_20,
    Format.presentation_40,
    Format.presentation_45,
    Format.workshop_120,
  ],
  topics: mockTopics,
}

const mockSpeaker: Speaker = {
  _id: 'speaker-1',
  _rev: '1',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  name: 'Alice Johnson',
  email: 'alice@example.com',
  slug: 'alice-johnson',
}

const mockEditingProposal: ProposalExisting = {
  _id: 'proposal-1',
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-11-15T10:30:00Z',
  _updatedAt: '2024-11-20T14:45:00Z',
  title: 'Building Scalable Kubernetes Applications',
  description: convertStringToPortableTextBlocks(
    'Learn how to build and deploy scalable applications on Kubernetes.',
  ),
  language: Language.english,
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer, Audience.operator],
  status: Status.submitted,
  outline: 'Intro, Architecture, Demo, Q&A',
  topics: [mockTopics[0], mockTopics[1]],
  tos: true,
  speakers: [mockSpeaker],
  conference: { _type: 'reference', _ref: 'conf-1' },
}

const mockSpeakers = [
  {
    _id: 'speaker-1',
    name: 'Alice Johnson',
    title: 'Platform Engineer',
    email: 'alice@example.com',
    image: null,
    slug: 'alice-johnson',
  },
  {
    _id: 'speaker-2',
    name: 'Bob Smith',
    title: 'SRE Lead',
    email: 'bob@example.com',
    image: null,
    slug: 'bob-smith',
  },
]

const meta: Meta<typeof ProposalManagementModal> = {
  title: 'Systems/Proposals/Admin/ProposalManagementModal',
  component: ProposalManagementModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A full-featured modal for creating or editing proposals from the admin interface. Built on the shared ModalShell. Includes speaker multi-select, the shared ProposalDetailsForm (title, description, format, level, audience, topics, outline), validation errors, and keyboard shortcuts (Cmd+S to save). Inspect at 393px and in dark mode.',
      },
    },
    msw: {
      handlers: [
        http.get('/api/trpc/speaker.admin.list', () => {
          return HttpResponse.json({
            result: { data: mockSpeakers },
          })
        }),
        http.post('/api/trpc/proposal.admin.create', () => {
          return HttpResponse.json({
            result: {
              data: {
                _id: 'new-proposal',
                _rev: '1',
                _type: 'talk',
                _createdAt: new Date().toISOString(),
                _updatedAt: new Date().toISOString(),
                title: 'New Proposal',
                status: 'submitted',
              },
            },
          })
        }),
        http.post('/api/trpc/proposal.admin.update', () => {
          return HttpResponse.json({
            result: {
              data: {
                _id: 'proposal-1',
                _rev: '2',
                _type: 'talk',
                _createdAt: '2024-11-15T10:30:00Z',
                _updatedAt: new Date().toISOString(),
                title: 'Updated Proposal',
                status: 'submitted',
              },
            },
          })
        }),
      ],
    },
  },
  decorators: [
    // ModalShell portals via HeadlessUI to document.body; mirror the toolbar
    // theme onto <html> so the portalled modal's dark: classes resolve.
    withPortalTheme,
    (Story) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ProposalManagementModal>

export const CreateNew: Story = {
  args: {
    isOpen: true,
    onClose: fn(),
    conference: mockConference,
    onProposalCreated: fn(),
  },
}

export const EditExisting: Story = {
  args: {
    isOpen: true,
    onClose: fn(),
    editingProposal: mockEditingProposal,
    conference: mockConference,
    onProposalUpdated: fn(),
  },
}

/**
 * The inline-create state: an organizer entering a proposal for someone who is
 * not in the system yet. The search has found nothing and the create form is
 * open — this is the state the copy has to carry, so it is what the story
 * opens, not the closed picker.
 */
export const CreateNewSpeakerInline: Story = {
  args: {
    isOpen: true,
    onClose: fn(),
    conference: mockConference,
    onProposalCreated: fn(),
  },
  play: async ({ canvasElement }) => {
    // ModalShell portals to document.body, so the canvas root is empty.
    void canvasElement
    const body = within(document.body)
    await userEvent.click(
      await body.findByRole('button', { name: 'Add speaker' }),
    )
    await userEvent.type(
      await body.findByLabelText('Search by name or email'),
      'Nina Keynote',
    )
    await userEvent.click(
      await body.findByText(/Not in the system\? Create the profile yourself/),
    )
    // Name is already carried over from the search term; only the address and
    // the title are left to type.
    await userEvent.type(
      await body.findByLabelText('Email'),
      'nina@example.com',
    )
    await userEvent.type(
      await body.findByLabelText('Title (optional)'),
      'Principal Engineer',
    )
  },
}

/**
 * After the organizer confirms: the drafted person is the primary speaker row,
 * removable because nothing is saved yet, and the proposal create carries them.
 */
export const CreateWithDraftedSpeaker: Story = {
  args: {
    isOpen: true,
    onClose: fn(),
    conference: mockConference,
    onProposalCreated: fn(),
  },
  play: async (context) => {
    await CreateNewSpeakerInline.play?.(context)
    const body = within(document.body)
    await userEvent.click(
      await body.findByRole('button', { name: /Add primary speaker/ }),
    )
  },
}

export const Closed: Story = {
  args: {
    isOpen: false,
    onClose: fn(),
    conference: mockConference,
  },
}
