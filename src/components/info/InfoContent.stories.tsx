import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { InfoContent } from './InfoContent'
import { buildInfoFaqs, getScheduleDayInfo } from '@/lib/conference/info-faq'
import { buildOnboardingDocuments } from '@/lib/onboarding/create'
import type { Conference, ConferenceSchedule } from '@/lib/conference/types'

/**
 * The `/info` FAQ. Every answer is built by `buildInfoFaqs`, so these stories
 * are the review surface for WHICH QUESTIONS EXIST at a given level of
 * configuration — the point of the day-one work is that a conference which has
 * said nothing has fewer questions, not wrong answers.
 */
const meta = {
  title: 'Systems/Info/InfoContent',
  component: InfoContent,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof InfoContent>

export default meta
type Story = StoryObj<typeof meta>

/** Built by the REAL provisioning builder, so the story cannot drift. */
function freshConference(): Conference {
  let key = 0
  const { conference } = buildOnboardingDocuments(
    {
      organization: {
        name: 'Brand New Events',
        slug: 'brand-new-events',
        contactEmail: 'hello@brand-new.example',
      },
      conference: {
        title: 'Brand New Conf',
        city: 'Bergen',
        country: 'Norway',
      },
      organizer: { name: 'Ada Organizer', email: 'ada@brand-new.example' },
      domains: ['brand-new.konf.run'],
    },
    {
      organizationId: 'org-fresh',
      conferenceId: 'conf-fresh',
      speakerId: 'speaker-fresh',
      mintKey: () => `key-${++key}`,
    },
    null,
  )
  return conference as unknown as Conference
}

const schedule: ConferenceSchedule = {
  _id: 'sched-1',
  date: '2026-10-27',
  tracks: [
    {
      trackTitle: 'Main track',
      trackDescription: '',
      talks: [
        { placeholder: 'Registration', startTime: '07:30', endTime: '08:45' },
        { placeholder: 'Closing', startTime: '16:00', endTime: '16:45' },
      ],
    },
  ],
} as unknown as ConferenceSchedule

/**
 * DAY ONE. No dates, no venue, no schedule. The page used to answer "The
 * conference will be held on TBD. Registration opens at 08:00…", promise food
 * and drinks, and describe an afterparty starting at 6 PM — none of which the
 * organizer had configured. Those questions are now simply not asked.
 */
export const FreshTenant: Story = {
  args: {
    faqs: buildInfoFaqs(freshConference(), getScheduleDayInfo(undefined)),
  },
}

/** The same page once dates, a venue and a schedule exist. */
export const ConfiguredConference: Story = {
  args: {
    faqs: buildInfoFaqs(
      {
        ...freshConference(),
        startDate: '2026-10-27',
        endDate: '2026-10-27',
        venueName: 'Grieghallen',
        venueAddress: 'Edvard Griegs plass 1, 5015 Bergen',
      } as Conference,
      getScheduleDayInfo([schedule]),
    ),
  },
}
