import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { HomepageSectionRenderer } from './SectionRenderer'
import { getDefaultSections } from '@/lib/homepage'
import type { Conference } from '@/lib/conference/types'
import {
  announcedConference,
  archivedConference,
  cancelledConference,
  cfpOpenConference,
  dayOneConference,
  midCycleConference,
  pinClock,
  postEventConference,
  soldOutConference,
} from './lifecycle.mocks'

/**
 * THE HOMEPAGE IN EVERY LIFECYCLE STATE.
 *
 * One story per state, each rendering the WHOLE page — deliberately not one
 * story per state per section, which would multiply the Chromatic snapshot count
 * without telling you anything the whole-page view does not.
 *
 * The clock is pinned so the date-derived stages (and the countdown) are stable
 * across snapshots. Read these top to bottom and the question the work exists to
 * answer is visible: does a brand-new event with nothing get a page that looks
 * deliberate?
 */

/** Placeholder photos for the gallery, so populated states actually render. */
const placeholderSvg = (w: number, h: number, label: string, hue: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  `<rect width="${w}" height="${h}" fill="hsl(${hue} 40% 32%)"/>` +
  `<text x="50%" y="50%" fill="hsl(${hue} 30% 78%)" font-family="sans-serif" font-size="${Math.round(
    h / 10,
  )}" text-anchor="middle" dominant-baseline="middle">${label}</text>` +
  `</svg>`

const mswHandlers = [
  http.get('https://cdn.sanity.io/images/*', ({ request }) => {
    const url = new URL(request.url)
    const n = Number(/gal(\d)/.exec(url.pathname)?.[1] ?? 1)
    const thumb = url.searchParams.get('w') === '512'
    return new HttpResponse(
      placeholderSvg(
        thumb ? 512 : 1920,
        thumb ? 320 : 1080,
        `Photo ${n}`,
        [210, 150, 30, 280][n - 1] ?? 210,
      ),
      { headers: { 'Content-Type': 'image/svg+xml' } },
    )
  }),
]

const meta = {
  // Pinning the clock is load-bearing here, not cosmetic: every stage in the
  // model is derived from `Date.now()` against the conference dates, so an
  // unpinned clock would eventually flip a story into a different state.
  //
  // `pinClock()` RETURNS the restore function and this arrow returns it, which
  // is how Storybook `beforeEach` teardown works (house pattern — see
  // `mockDateBeforeEach`). Do not swallow the return value: the pinned `Date`
  // would then leak into every story rendered afterwards in the same session.
  beforeEach: () => pinClock(),
  title: 'Systems/Homepage/Public/Matrix/HomepageLifecycle',
  tags: ['matrix'],
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: mswHandlers },
    docs: {
      description: {
        component:
          'The homepage rendered in each lifecycle state. Stage is derived from the CFP / programme / event dates; only cancelled and archived are explicit. Every section either hides itself or renders a deliberate placeholder — no zeroes, no empty grids, no lonely headings.',
      },
    },
  },
} satisfies Meta<typeof HomepageSectionRenderer>

export default meta
type Story = StoryObj<typeof meta>

function page(
  conference: Conference,
  extra: Partial<React.ComponentProps<typeof HomepageSectionRenderer>> = {},
) {
  return {
    render: () => (
      <HomepageSectionRenderer
        sections={getDefaultSections(conference)}
        conference={conference}
        {...extra}
      />
    ),
  }
}

/**
 * DAY ONE — the state that decides adoption. Title, tagline, dates, city and
 * venue; nothing else exists. No CFP dates, no programme date, no ticketing, no
 * team, no photos, no sponsors.
 */
export const DayOne: Story = {
  ...page(dayOneConference),
  parameters: {
    docs: {
      description: {
        story:
          'A brand-new event with nothing but its dates and venue. The save-the-date band carries the page: dates, place and a live countdown. The roadmap is absent rather than three "TBA" rows, because none of the CFP / programme / ticket dates are set yet.',
      },
    },
  },
}

export const DayOneDark: Story = {
  ...page(dayOneConference),
  parameters: {
    theme: 'dark',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    (Story) => (
      <div className="dark bg-gray-950">
        <Story />
      </div>
    ),
  ],
}

/**
 * Day one plus the team and the dates they have committed to — the realistic
 * second day of setup, and the state most new events actually sit in.
 */
export const Announced: Story = {
  ...page(announcedConference),
  parameters: {
    docs: {
      description: {
        story:
          'Dates announced, CFP not open yet. The roadmap now has all three steps — call for speakers opening on a date, programme announced on a date, and no ticket row because nothing is known about sales. The organizers band fills the middle slot.',
      },
    },
  },
}

/**
 * CFP open on a FIRST edition: no past photos, no speakers, no sponsors yet.
 * Distinct from day one — the event is real, there is simply no history.
 */
export const CfpOpenFirstEdition: Story = {
  ...page(cfpOpenConference, { ticketAvailability: 'upcoming' }),
  parameters: {
    docs: {
      description: {
        story:
          'First edition with the CFP open and ticket sales not started. The hero leads with "Submit to Speak", the roadmap shows the CFP open and tickets not yet on sale, and the gallery hides itself entirely rather than leaving a "Conference Moments" heading over nothing.',
      },
    },
  },
}

/** A returning edition mid-cycle. This is the shape the page has always had. */
export const ProgrammePublished: Story = {
  ...page(midCycleConference, { ticketsFromPrice: '3 490' }),
  parameters: {
    docs: {
      description: {
        story:
          'Programme published, tickets on sale, photos from the last edition. No save-the-date band: the page has real content to lead with, so the composition is exactly what it was before the lifecycle work.',
      },
    },
  },
}

/** Same conference, but the provider reports every active type at zero. */
export const SoldOut: Story = {
  ...page(soldOutConference, {
    ticketsFromPrice: '3 490',
    ticketAvailability: 'sold-out',
  }),
  parameters: {
    docs: {
      description: {
        story:
          'Sold out. No ticket button anywhere — the hero and the section CTA rows both drop it and state the fact instead, rather than sending visitors to a checkout that cannot serve them.',
      },
    },
  },
}

/** After the event: photos and recordings lead, the CTA becomes the programme. */
export const PostEvent: Story = {
  ...page(postEventConference),
  parameters: {
    docs: {
      description: {
        story:
          'The event has happened. Photos sit directly under the hero, the primary CTA is "Watch the talks" (only because recordings actually exist on the talks), and the "Become a Sponsor" pitch is suppressed while the sponsors themselves stay as a thank-you wall.',
      },
    },
  },
}

/** Explicit override: replaces the page, not a banner on it. */
export const Cancelled: Story = {
  ...page(cancelledConference, { ticketsFromPrice: '3 490' }),
  parameters: {
    docs: {
      description: {
        story:
          'A cancelled edition. The notice REPLACES the page — the speaker shelf, the countdown and every ticket CTA are gone, because visitors act on buttons rather than on paragraphs. The conference here still has a full composition stored; it is not rendered.',
      },
    },
  },
}

/** The tombstone. */
export const Archived: Story = {
  ...page(archivedConference),
  parameters: {
    docs: {
      description: {
        story:
          'Ended for good. A headline, the years, a thank-you and one link to the archive. Nothing else.',
      },
    },
  },
}

/**
 * The regression this whole change exists to prevent: a schedule that has been
 * published but holds no confirmed talks.
 */
export const PublishedButEmptySchedule: Story = {
  ...page({
    ...midCycleConference,
    schedules: [{ _id: 's1', date: '2026-06-10', tracks: [] }],
    featuredGalleryImages: [],
  } as unknown as Conference),
  parameters: {
    docs: {
      description: {
        story:
          'Programme date passed, schedule document empty. This rendered "0+ Sessions / 0+ Speakers / 0 Workshops / 0+ Topics / 0 Tracks" in production. The slot now falls through to the featured speakers, who do have something to show.',
      },
    },
  },
}
