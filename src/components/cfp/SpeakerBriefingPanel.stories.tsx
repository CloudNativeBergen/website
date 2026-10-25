import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpeakerBriefingPanel } from './SpeakerBriefingPanel'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import type { TypedObject } from 'sanity'
import { Format } from '@/lib/proposal/types'
import type { SpeakerBriefing } from '@/lib/speaker/briefing'

const pt = (s: string) =>
  convertStringToPortableTextBlocks(s) as unknown as TypedObject[]

const talks: NonNullable<SpeakerBriefing['talks']> = [
  {
    proposalId: 'talk-1',
    title: 'Scaling Kubernetes at the edge',
    format: Format.presentation_25,
    isWorkshop: false,
    date: '2026-10-27',
    startTime: '10:00',
    endTime: '10:40',
    trackTitle: 'Main stage',
  },
  {
    proposalId: 'talk-2',
    title: 'GitOps in practice',
    format: Format.workshop_120,
    isWorkshop: true,
    date: '2026-10-28',
    startTime: '13:00',
    endTime: '13:25',
    trackTitle: 'Room 2',
  },
]

const todos: SpeakerBriefing['todos'] = [
  { kind: 'upload-slides', proposalId: 'talk-1', title: talks[0].title },
  {
    kind: 'co-speaker-invite-pending',
    proposalId: 'talk-1',
    title: talks[0].title,
  },
  { kind: 'claim-ticket', title: 'Speaker ticket' },
  { kind: 'travel-support', title: 'Travel support request' },
]

const full: SpeakerBriefing = {
  todos,
  talks,
  dinner: {
    rsvpNote: 'Reply on your speaker ticket by 20 October.',
    startsAt: '2026-10-26T17:30:00.000Z',
    venueName: 'Bryggen Tracteursted',
    address: 'Bryggestredet 2, 5003 Bergen',
    mapUrl: 'https://maps.example.com/dinner',
    description: pt(
      'Three courses. Tell us about dietary needs on the ticket.',
    ),
    routes: [
      {
        _key: 'walk',
        label: 'Walk together',
        meetingPoint: 'Venue main entrance',
        meetingPointMapUrl: 'https://maps.example.com/entrance',
        departsAt: '2026-10-26T17:00:00.000Z',
        details: pt('About 15 minutes on foot.'),
      },
      { _key: 'own', label: 'On your own', departsNote: 'Whenever suits you' },
    ],
  },
  checkIn: pt('Pick up your badge at the speaker desk by the entrance.'),
  equipment: pt(
    'HDMI and USB-C adapters are on stage. Bring your own clicker.',
  ),
  onsiteContact: {
    name: 'Kari Nordmann',
    phone: '+47 900 00 000',
    email: 'speakers@example.com',
  },
  accommodation: pt(
    'Rooms are booked at Hotel Example for travel-supported speakers.',
  ),
  extra: pt('Speaker lounge on the second floor.'),
  venueName: 'Grieghallen',
  venueAddress: 'Edvard Griegs plass 1, 5015 Bergen',
  venueTravelInfo: 'Ten minutes on foot from Bergen station.',
}

const meta = {
  title: 'Systems/CFP/SpeakerBriefingPanel',
  component: SpeakerBriefingPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The speaker briefing (#1592) at the top of the current conference card on `/cfp/list#briefing`. Empty parts are left out. On a conference day, today’s talks, check-in and the on-site contact are pinned and the rest is collapsed.',
      },
    },
  },
} satisfies Meta<typeof SpeakerBriefingPanel>

export default meta
type Story = StoryObj<typeof meta>

export const PreEvent: Story = {
  args: { briefing: full, changesEmail: 'cfp@example.com' },
}

export const ConferenceDay: Story = {
  args: {
    briefing: full,
    conferenceDay: '2026-10-27',
    pinDinner: true,
    changesEmail: 'cfp@example.com',
  },
}

export const Minimal: Story = { args: { briefing: { talks, todos } } }
