import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { mockDateBeforeEach } from '@/lib/storybook'
import { ProposalContextPaneView } from '@/components/messaging'
import {
  Format,
  Language,
  Level,
  Status,
  type ProposalExisting,
} from '@/lib/proposal/types'
import { Flags, type Speaker } from '@/lib/speaker/types'

/**
 * The READ-ONLY proposal rail of the three-pane messages surface. Presentational
 * — the container's tRPC read is exercised by the workspace stories — so every
 * state here is a fixture, and the pane is checked for the things a rail gets
 * wrong: a long title, three speakers, a missing schedule slot, and the amber
 * travel-funding flag all inside 288–320px.
 */

const speaker = (name: string, extra: Partial<Speaker> = {}): Speaker =>
  ({
    _id: `speaker-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    ...extra,
  }) as unknown as Speaker

const baseProposal = (
  overrides: Partial<ProposalExisting> = {},
): ProposalExisting =>
  ({
    _id: 'talk-1',
    _rev: 'rev-1',
    _type: 'talk',
    _createdAt: '2026-05-02T09:00:00.000Z',
    _updatedAt: '2026-06-11T09:00:00.000Z',
    title: 'Scaling Kubernetes to 10,000 nodes',
    status: Status.accepted,
    format: Format.presentation_25,
    level: Level.intermediate,
    language: Language.english,
    conference: { _id: 'conf-1', title: 'Cloud Native Days' },
    speakers: [speaker('Kari Nordmann')],
    ...overrides,
  }) as unknown as ProposalExisting

const meta = {
  title: 'Components/Messaging/ProposalContextPane',
  component: ProposalContextPaneView,
  beforeEach: mockDateBeforeEach(new Date('2026-07-18T12:00:00Z')),
  parameters: { layout: 'fullscreen' },
  decorators: [
    // Stands in for the workspace pane: the rail's real width (`lg:w-72`,
    // `xl:w-80`) against the pane's own background, so a capture maps 1:1 to
    // what the workspace renders.
    (Story, ctx) => (
      <div className={ctx.parameters.dark ? 'dark' : ''}>
        <div className="flex h-[700px] bg-gray-100 dark:bg-gray-950">
          <div className="w-72 border-l border-gray-200 bg-gray-50 xl:w-80 dark:border-gray-700 dark:bg-gray-900/40">
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ProposalContextPaneView>

export default meta
type Story = StoryObj<typeof meta>

/** An accepted talk that already has a schedule slot. */
export const Scheduled: Story = {
  args: {
    proposal: baseProposal({
      scheduleInfo: {
        date: '2026-10-27',
        trackTitle: 'Platform Engineering',
        timeSlot: { startTime: '13:20', endTime: '13:45' },
      },
    }),
  },
}

export const ScheduledDark: Story = {
  ...Scheduled,
  parameters: { dark: true, layout: 'fullscreen' },
}

/** Submitted, not yet on the schedule — the honest "Not on the schedule" line. */
export const NotScheduled: Story = {
  args: {
    proposal: baseProposal({
      status: Status.submitted,
      scheduleInfo: undefined,
    }),
  },
}

/** Multiple speakers, one of whom needs travel funding — the amber flag. */
export const TravelFundingAndCoSpeakers: Story = {
  args: {
    proposal: baseProposal({
      title:
        'Everything We Learned Migrating Three Hundred Microservices Off a Shared Postgres',
      status: Status.confirmed,
      format: Format.workshop_120,
      speakers: [
        speaker('Kari Nordmann', {
          flags: [Flags.requiresTravelFunding],
        } as Partial<Speaker>),
        speaker('Ola Nordmann'),
        speaker('Grace Hopper'),
      ],
      scheduleInfo: {
        date: '2026-10-28',
        trackTitle: 'Workshops',
        timeSlot: { startTime: '09:00', endTime: '11:00' },
      },
    }),
  },
}

export const TravelFundingAndCoSpeakersDark: Story = {
  ...TravelFundingAndCoSpeakers,
  parameters: { dark: true, layout: 'fullscreen' },
}

/** The narrow-screen drill-down step: the pane owns a back link to the thread. */
export const MobileStepWithBackLink: Story = {
  args: {
    proposal: baseProposal({
      scheduleInfo: {
        date: '2026-10-27',
        trackTitle: 'Platform Engineering',
        timeSlot: { startTime: '13:20', endTime: '13:45' },
      },
    }),
    backHref: '/admin/messages/conversation.proposal.talk-1',
  },
  decorators: [
    (Story) => (
      <div className="h-[700px] w-full bg-gray-50 dark:bg-gray-900/40">
        <Story />
      </div>
    ),
  ],
}

/** A rejected proposal — the status badge is the only colour that changes. */
export const Rejected: Story = {
  args: { proposal: baseProposal({ status: Status.rejected }) },
}
