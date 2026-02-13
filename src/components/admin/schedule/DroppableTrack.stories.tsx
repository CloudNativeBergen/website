import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DndContext } from '@dnd-kit/core'
import { MemoizedDroppableTrack as DroppableTrack } from './DroppableTrack'
import { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import { fn } from 'storybook/test'

const createMockProposal = (
  overrides: Partial<ProposalExisting> = {},
): ProposalExisting => ({
  _id: `proposal-${overrides._id || '1'}`,
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-11-15T10:30:00Z',
  _updatedAt: '2024-11-20T14:45:00Z',
  title: 'Building Scalable Kubernetes Applications',
  description: convertStringToPortableTextBlocks('A talk about Kubernetes.'),
  language: Language.english,
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer],
  status: Status.confirmed,
  outline: '',
  topics: [
    {
      _id: 'topic-1',
      _type: 'topic',
      title: 'Kubernetes',
      color: '#326CE5',
      slug: { current: 'kubernetes' },
    },
  ],
  tos: true,
  speakers: [
    {
      _id: 'speaker-1',
      _rev: '1',
      _createdAt: '2024-01-01T00:00:00Z',
      _updatedAt: '2024-01-01T00:00:00Z',
      name: 'Alice Johnson',
      email: 'alice@example.com',
      slug: 'alice-johnson',
    },
  ],
  conference: { _type: 'reference', _ref: 'conf-1' },
  attachments: [],
  ...overrides,
})

const emptyTrack: ScheduleTrack = {
  trackTitle: 'Main Stage',
  trackDescription: 'The primary conference track',
  talks: [],
}

const trackWithTalks: ScheduleTrack = {
  trackTitle: 'Platform Engineering',
  trackDescription: 'Talks about internal developer platforms',
  talks: [
    {
      talk: createMockProposal({ _id: 'talk-1' }),
      startTime: '09:00',
      endTime: '09:45',
    },
    {
      placeholder: 'Coffee Break',
      startTime: '09:45',
      endTime: '10:00',
    },
    {
      talk: createMockProposal({
        _id: 'talk-2',
        title: 'GitOps for Everyone',
        format: Format.presentation_25,
        level: Level.beginner,
      }),
      startTime: '10:00',
      endTime: '10:25',
    },
  ] as TrackTalk[],
}

const trackWithServiceSessions: ScheduleTrack = {
  trackTitle: 'Workshop Room',
  trackDescription: 'Hands-on workshop track',
  talks: [
    {
      placeholder: 'Registration & Welcome Coffee',
      startTime: '08:00',
      endTime: '09:00',
    },
    {
      talk: createMockProposal({
        _id: 'workshop-1',
        title: 'Hands-on Kubernetes Security',
        format: Format.workshop_120,
        level: Level.advanced,
      }),
      startTime: '09:00',
      endTime: '11:00',
    },
    {
      placeholder: 'Lunch',
      startTime: '11:00',
      endTime: '12:00',
    },
  ] as TrackTalk[],
}

const meta: Meta<typeof DroppableTrack> = {
  title: 'Systems/Program/Admin/DroppableTrack',
  component: DroppableTrack,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A droppable track column in the schedule editor. Displays a timeline from 08:00-21:00 with 5-minute drop zones. Supports drag-and-drop of proposals and service sessions, inline editing of track title/description, service session creation, resize, rename, duplicate-to-all-tracks, and talk removal. Shows swap indicators when dragging talks over occupied slots.',
      },
    },
  },
  decorators: [
    (Story) => (
      <DndContext>
        <div className="flex h-screen overflow-auto p-4">
          <Story />
        </div>
      </DndContext>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof DroppableTrack>

export const EmptyTrack: Story = {
  args: {
    track: emptyTrack,
    trackIndex: 0,
    onUpdateTrack: fn(),
    onRemoveTrack: fn(),
    onRemoveTalk: fn(),
    onDuplicateServiceSession: fn(),
  },
}

export const WithTalks: Story = {
  args: {
    track: trackWithTalks,
    trackIndex: 0,
    onUpdateTrack: fn(),
    onRemoveTrack: fn(),
    onRemoveTalk: fn(),
    onDuplicateServiceSession: fn(),
  },
}

export const WithServiceSessions: Story = {
  args: {
    track: trackWithServiceSessions,
    trackIndex: 1,
    onUpdateTrack: fn(),
    onRemoveTrack: fn(),
    onRemoveTalk: fn(),
    onDuplicateServiceSession: fn(),
  },
}
