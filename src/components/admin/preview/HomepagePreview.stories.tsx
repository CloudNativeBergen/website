import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { HomepagePreview } from './HomepagePreview'
import { mockFeaturedSpeakers } from '@/components/featuredSpeakers.mocks'
import type { Conference } from '@/lib/conference/types'
import type { HomepageSection } from '@/lib/homepage/sections'

/**
 * The homepage composer's live preview (E4).
 *
 * The iframe ELEMENT cannot run in Storybook, but nothing interesting lives in
 * it: the preview's whole content — chrome, band frames, chips, placeholder
 * page — is an ordinary component tree, captured here exactly as
 * `HomepageComposition.stories.tsx` already captures the public composition.
 *
 * WHAT TO LOOK FOR IN EACH CAPTURE:
 *  - **Design vs Live on the SAME empty conference.** Design is a full page of
 *    obviously-sample content; Live is the near-blank page a visitor would
 *    actually get. That pair is the honesty mechanism the whole batch exists for.
 *  - **The amber chips and dashed outlines** mark every band standing on sample
 *    content, and name where to add the real thing.
 *  - **The gallery band shows gradient "SAMPLE PHOTO" tiles.** If it shows the
 *    loud red plate below instead, the placeholder-image swap regressed: sample
 *    tiles carry a well-formed but nonexistent Sanity asset ref, and anything
 *    that renders them through the CDN builder 404s.
 */

/**
 * A deliberately ALARMING stand-in for the Sanity CDN.
 *
 * Nothing in these stories should ever reach it: real photos are not in the
 * fixtures, and placeholder tiles are swapped to their own `data:` URI by the
 * preview's DOM guard before the browser can paint them. So the handler does not
 * return a plausible photo — it returns a red failure plate, which turns a
 * silent regression into something impossible to miss in a screenshot.
 */
const handlers = [
  http.get(
    'https://cdn.sanity.io/images/*',
    () =>
      new HttpResponse(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">` +
          `<rect width="1600" height="900" fill="#b91c1c"/>` +
          `<text x="800" y="470" fill="#fff" font-family="sans-serif" font-size="64" font-weight="700" text-anchor="middle">CDN FETCH — SWAP FAILED</text>` +
          `</svg>`,
        { headers: { 'Content-Type': 'image/svg+xml' } },
      ),
  ),
]

/** Fixed reference time so placeholder dates and the countdown never thrash. */
const NOW = Date.parse('2026-03-01T12:00:00Z')

/**
 * DAY ONE: a conference with an identity and nothing else. No speakers, no
 * sponsors, no photos, no programme, no dates — the state in which the old
 * editor previewed as a hero on top of a sponsor pitch, and the state the
 * owner's "a mix of real data and placeholders" is really about.
 */
const bareConference = {
  _id: 'conf-1',
  title: 'Nordic Platform Days',
  organizer: 'Nordic Platform Community',
  tagline: 'The conference for people who run the platform',
  description:
    'A community conference for platform engineers, SREs and everyone who keeps production up.',
  city: 'Bergen',
  country: 'Norway',
  domains: ['2026.nordicplatformdays.no'],
  registrationEnabled: true,
  registrationLink: 'https://tickets.example.com',
  cfpStartDate: '2026-01-01',
  cfpEndDate: '2026-06-01',
  cfpNotifyDate: '2026-06-15',
  cfpEmail: 'cfp@example.com',
  contactEmail: 'hello@example.com',
  sponsorEmail: 'sponsors@example.com',
  formats: [],
  topics: [],
  organizers: [],
  socialLinks: [],
  theme: { primaryColor: '#1D4ED8', accentColor: '#06B6D4' },
} as unknown as Conference

/** The same conference a year in: real speakers, real sponsors, real metrics. */
const populatedConference = {
  ...bareConference,
  startDate: '2026-09-15',
  endDate: '2026-09-15',
  venueName: 'Grieghallen',
  venueAddress: 'Edvard Griegs plass 1\n5015 Bergen\nNorway',
  featuredSpeakers: mockFeaturedSpeakers,
  vanityMetrics: [
    { label: 'Attendees', value: '450+' },
    { label: 'Speakers', value: '40' },
    { label: 'Tracks', value: '4' },
  ],
  ticketFaqs: [
    {
      _key: 't1',
      question: 'Can I get a refund?',
      answer: 'Tickets are refundable up to 14 days before the event.',
    },
  ],
} as unknown as Conference

/**
 * A composition that exercises the whole vocabulary: every content band that
 * can self-hide, one band switched OFF with the eye toggle, and a rich-text
 * block left empty so the "not shown on the live site" plate appears.
 */
const sections: HomepageSection[] = [
  { _key: 'hero', _type: 'homepageHero' },
  { _key: 'countdown', _type: 'homepageCountdown', heading: 'Doors open in' },
  {
    _key: 'speakers',
    _type: 'homepageFeaturedSpeakers',
    heading: 'Who you will hear',
  },
  { _key: 'program', _type: 'homepageProgramHighlights' },
  { _key: 'metrics', _type: 'homepageMetrics', heading: 'By the numbers' },
  { _key: 'gallery', _type: 'homepageGallery' },
  { _key: 'faq', _type: 'homepageFaq', source: 'own', items: [] },
  { _key: 'venue', _type: 'homepageVenue', heading: 'Where to find us' },
  // Empty on purpose: nothing at conference level can back a rich-text block,
  // so Design mode plates it rather than silently dropping it.
  { _key: 'rich', _type: 'homepageRichText', content: [] },
  {
    _key: 'organizers',
    _type: 'homepageOrganizers',
    hidden: true,
    heading: 'Meet the crew',
  },
  { _key: 'sponsors', _type: 'homepageSponsors' },
]

const meta = {
  beforeEach: () => {
    // Pin the clock (house pattern — see Countdown.stories). The preview takes
    // `now` for its OWN date maths, but the lifecycle resolver, `isConferenceOver`
    // and the countdown's tick all read the real clock; leaving those unpinned
    // makes a fixed `now` disagree with them and the capture reports a future
    // conference as a past one.
    const OriginalDate = globalThis.Date
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockDate: any = function (...args: any[]) {
      if (args.length === 0) return new OriginalDate(NOW)
      return new (
        Function.prototype.bind.apply(OriginalDate, [
          null,
          ...args,
        ]) as typeof OriginalDate
      )()
    }
    Object.setPrototypeOf(MockDate, OriginalDate)
    MockDate.prototype = Object.create(OriginalDate.prototype)
    MockDate.now = () => NOW
    MockDate.parse = OriginalDate.parse.bind(OriginalDate)
    MockDate.UTC = OriginalDate.UTC.bind(OriginalDate)
    globalThis.Date = MockDate
    return () => {
      globalThis.Date = OriginalDate
    }
  },

  title: 'Systems/Homepage/Admin/HomepagePreview',
  component: HomepagePreview,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
  },
  args: {
    conference: bareConference,
    sections,
    now: NOW,
    ticketsFromPrice: '3 490',
  },
} satisfies Meta<typeof HomepagePreview>

export default meta
type Story = StoryObj<typeof meta>

/**
 * DESIGN MODE — the default. Every empty collection is backed by sample
 * content, every sample-backed band carries an amber chip naming where the real
 * thing is edited, the switched-off Organizers band is ghosted rather than
 * absent, and the empty rich-text block is plated with its reason.
 */
export const DesignMode: Story = {
  args: { mode: 'design', scheme: 'light' },
}

export const DesignModeDark: Story = {
  args: { mode: 'design', scheme: 'dark' },
  parameters: { backgrounds: { default: 'dark' } },
}

/**
 * LIVE MODE, same conference — what a visitor gets today. The hero, and then
 * almost nothing: this is the page the organizer would have shipped, and seeing
 * it one toggle away from the design view is the point.
 */
export const LiveMode: Story = {
  args: { mode: 'live', scheme: 'light' },
}

export const LiveModeDark: Story = {
  args: { mode: 'live', scheme: 'dark' },
  parameters: { backgrounds: { default: 'dark' } },
}

/**
 * A conference with REAL content, in Live mode: the fidelity claim, visible.
 * Real speakers, real metrics, real venue — no chips, because nothing here is a
 * placeholder. Sponsors and gallery are still empty, so they degrade and hide
 * exactly as they would on the live site.
 */
export const LiveModeWithRealContent: Story = {
  args: {
    conference: populatedConference,
    mode: 'live',
    scheme: 'light',
  },
}

/**
 * The composer's locate loop: hovering a rail card outlines its band, clicking
 * one selects it. Captured with Featured Speakers focused and Metrics hovered.
 */
export const DesignModeFocusedBand: Story = {
  args: {
    mode: 'design',
    scheme: 'light',
    focusKey: 'speakers',
    hoverKey: 'metrics',
  },
}

/**
 * `cancelled` / `archived` REPLACE the page rather than reorder it. The preview
 * short-circuits above the band loop and shows the real replacement — which is
 * what visitors get, and worth seeing before it goes out.
 */
export const CancelledConference: Story = {
  args: {
    conference: {
      ...populatedConference,
      lifecycleStatus: 'cancelled',
    } as unknown as Conference,
    mode: 'design',
    scheme: 'light',
  },
}
