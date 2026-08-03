import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { SaveTheDate } from './SaveTheDate'
import type { Conference } from '@/lib/conference/types'
import type { HomepageLifecycle } from '@/lib/homepage/lifecycle'

const FIXED_NOW = new Date('2026-03-01T12:00:00Z').getTime()

const conference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Bergen',
  organizer: 'CNDN',
  city: 'Bergen',
  country: 'Norway',
  venueName: 'Grieghallen',
  startDate: '2026-10-27',
  endDate: '2026-10-28',
  cfpStartDate: '2026-04-01',
  cfpEndDate: '2026-06-15',
  programDate: '2026-08-15',
  registrationEnabled: false,
} as unknown as Conference

const lifecycle: HomepageLifecycle = {
  stage: 'announced',
  cfp: 'upcoming',
  tickets: 'unavailable',
  content: {
    hasGallery: false,
    hasFeaturedSpeakers: false,
    hasOrganizers: false,
    hasSponsors: false,
    hasVanityMetrics: false,
    hasProgramme: false,
    hasRecordings: false,
    isFirstEdition: true,
  },
  primaryCta: 'info',
  isOverridden: false,
}

const meta = {
  beforeEach: () => {
    // Pin the clock (house pattern — see Countdown.stories): the countdown
    // strip reads Date.now() every tick, so an unpinned clock drifts snapshots.
    const OriginalDate = globalThis.Date
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockDate: any = function (...args: any[]) {
      if (args.length === 0) return new OriginalDate(FIXED_NOW)
      return new (
        Function.prototype.bind.apply(OriginalDate, [
          null,
          ...args,
        ]) as typeof OriginalDate
      )()
    }
    Object.setPrototypeOf(MockDate, OriginalDate)
    MockDate.prototype = Object.create(OriginalDate.prototype)
    MockDate.now = () => FIXED_NOW
    MockDate.parse = OriginalDate.parse.bind(OriginalDate)
    MockDate.UTC = OriginalDate.UTC.bind(OriginalDate)
    globalThis.Date = MockDate
    return () => {
      globalThis.Date = OriginalDate
    }
  },

  title: 'Systems/Homepage/Public/SaveTheDate',
  component: SaveTheDate,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The day-one band. Built entirely from what a brand-new organizer has already entered — the dates, the venue and city, a live countdown, and whichever CFP / programme / ticket milestones carry a date. The `description` is OPTIONAL EXTRA COPY with no derived default: the dates and the place are already the card’s headline and place line, so an empty description simply adds no line rather than restating them. Two variants: `card` (the default — the tall boxed card with the “what happens next” roadmap) and `strip` (one slim band with the dates, the place and the compact countdown, for a page that has real content above it and only wants the reminder).',
      },
    },
  },
  args: { conference, lifecycle },
  tags: ['autodocs'],
} satisfies Meta<typeof SaveTheDate>

export default meta
type Story = StoryObj<typeof meta>

/** The unconfigured case: no description. The card is still complete. */
export const WithoutDescription: Story = {
  args: { section: { _key: 'std', _type: 'homepageSaveTheDate' } },
}

/** An organizer-written extra line, rendered verbatim under the place. */
export const WithDescription: Story = {
  args: {
    section: {
      _key: 'std',
      _type: 'homepageSaveTheDate',
      description:
        'Two days of talks, workshops and hallway track on the western fjords.',
    },
  },
}

/** Venue not booked yet — the place line shows the city alone, no stray comma. */
export const CityOnly: Story = {
  args: {
    section: { _key: 'std', _type: 'homepageSaveTheDate' },
    conference: { ...conference, venueName: undefined } as Conference,
  },
}

/** Dates not fixed yet — the title takes the headline slot instead of "TBD". */
export const NoDatesYet: Story = {
  args: {
    section: { _key: 'std', _type: 'homepageSaveTheDate' },
    conference: { ...conference, startDate: '', endDate: '' } as Conference,
  },
}

const darkDecorator: Decorator[] = [
  (Story) => (
    <div className="dark bg-gray-950">
      <Story />
    </div>
  ),
]

const dark = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  decorators: darkDecorator,
}

export const Dark: Story = {
  args: WithDescription.args,
  ...dark,
}

/* --------------------------------- strip -------------------------------- */

/**
 * `strip`: the same announcement, a fraction of the height. The roadmap goes —
 * it is the part that only makes sense on a page with nothing else on it — and
 * the countdown moves beside the dates instead of under them.
 */
export const Strip: Story = {
  args: {
    section: {
      _key: 'std',
      _type: 'homepageSaveTheDate',
      variant: 'strip',
      description:
        'Two days of talks, workshops and hallway track on the western fjords.',
    },
  },
}

export const StripDark: Story = {
  args: Strip.args,
  ...dark,
}

/** The strip at its slimmest: dates, place and countdown, no extra copy. */
export const StripWithoutDescription: Story = {
  args: {
    section: { _key: 'std', _type: 'homepageSaveTheDate', variant: 'strip' },
  },
}

/** Edge case: dates not fixed yet — the title takes the headline slot. */
export const StripNoDatesYet: Story = {
  args: {
    section: { _key: 'std', _type: 'homepageSaveTheDate', variant: 'strip' },
    conference: { ...conference, startDate: '', endDate: '' } as Conference,
  },
}
