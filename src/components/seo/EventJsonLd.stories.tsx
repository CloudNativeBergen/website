import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { EventJsonLd } from './EventJsonLd'
import {
  buildEventJsonLd,
  type BuildEventJsonLdOptions,
} from '@/lib/seo/eventJsonLd'
import type { Conference } from '@/lib/conference/types'

const baseConference = {
  title: 'Cloud Native Bergen 2099',
  organizer: 'Cloud Native Bergen',
  city: 'Bergen',
  country: 'NO',
  venueName: 'Grieghallen',
  venueAddress: 'Edvard Griegs plass 1',
  description: 'A community conference for cloud native practitioners.',
  startDate: '2099-10-27T09:00:00Z',
  endDate: '2099-10-27T17:00:00Z',
  socialLinks: [
    'https://twitter.com/cloudnativeberg',
    'https://www.linkedin.com/company/cloud-native-bergen',
  ],
  registrationEnabled: true,
  registrationLink: 'https://checkin.no/event/12345',
} as unknown as Conference

/**
 * `<EventJsonLd>` emits an invisible `<script type="application/ld+json">`.
 * These stories render that script and, for review, pretty-print the exact
 * object it serializes so the mapping is visible in Storybook.
 */
function JsonLdPreview(props: BuildEventJsonLdOptions) {
  const data = buildEventJsonLd(props)
  return (
    <div className="max-w-3xl font-mono text-sm">
      <EventJsonLd {...props} />
      <p className="mb-3 font-sans text-gray-600 dark:text-gray-300">
        Rendered schema.org <code>Event</code> JSON-LD (paste into Google&apos;s
        Rich Results Test to validate):
      </p>
      <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-gray-100">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

const meta = {
  title: 'Systems/SEO/EventJsonLd',
  component: JsonLdPreview,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof JsonLdPreview>

export default meta
type Story = StoryObj<typeof meta>

/** Home page: full data, no performers (kept simple). */
export const HomePage: Story = {
  args: {
    conference: baseConference,
    domain: 'cloudnativebergen.dev',
    lowestTicketPrice: { amountInclVat: 1500, formatted: '1 500' } as never,
  },
}

/** Program page: adds `performer` entries for confirmed speakers. */
export const ProgramPage: Story = {
  args: {
    conference: baseConference,
    domain: 'cloudnativebergen.dev',
    performers: [
      { name: 'Ada Lovelace', image: 'https://cdn.example/ada.jpg' },
      { name: 'Alan Turing' },
    ],
  },
}

/** Venue unknown: the whole `location` block is gracefully omitted. */
export const MissingVenue: Story = {
  args: {
    conference: {
      ...baseConference,
      venueName: undefined,
      venueAddress: undefined,
      city: undefined,
      country: undefined,
    } as unknown as Conference,
    domain: 'cloudnativebergen.dev',
  },
}
