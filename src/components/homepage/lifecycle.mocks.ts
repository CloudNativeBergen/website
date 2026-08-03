import type { Conference } from '@/lib/conference/types'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import {
  plainSpeaker,
  shortRoleSpeaker,
  workshopSpeaker,
} from '@/components/featuredSpeakers.mocks'

/**
 * Fixtures for the homepage lifecycle stories.
 *
 * Every conference here differs from the others ONLY in the fields the
 * lifecycle model reads (dates, registration, content), so the stories compare
 * states rather than unrelated copy. The clock is pinned to {@link FIXED_NOW} by
 * the story `beforeEach`, which is what makes the date-derived stages
 * deterministic in Chromatic.
 */

export const FIXED_NOW_ISO = '2026-03-01T12:00:00Z'
export const FIXED_NOW = new Date(FIXED_NOW_ISO).getTime()

/**
 * The house clock-pinning hook (see `Countdown.stories`). Returned as a factory
 * so several story files can share it without sharing module state.
 */
export function pinClock(now: number = FIXED_NOW) {
  const OriginalDate = globalThis.Date
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockDate: any = function (...args: any[]) {
    if (args.length === 0) return new OriginalDate(now)
    return new (
      Function.prototype.bind.apply(OriginalDate, [
        null,
        ...args,
      ]) as typeof OriginalDate
    )()
  }
  Object.setPrototypeOf(MockDate, OriginalDate)
  MockDate.prototype = Object.create(OriginalDate.prototype)
  MockDate.now = () => now
  MockDate.parse = OriginalDate.parse.bind(OriginalDate)
  MockDate.UTC = OriginalDate.UTC.bind(OriginalDate)
  globalThis.Date = MockDate
  return () => {
    globalThis.Date = OriginalDate
  }
}

// ── Content fixtures ────────────────────────────────────────────────────────

/**
 * A Sanity asset ref must be syntactically valid or the image-url builder
 * produces nothing — 40 hex characters then `-WIDTHxHEIGHT-ext`.
 */
function galleryImage(n: number): GalleryImageWithSpeakers {
  const id = `gal${n}`
  return {
    _id: id,
    _rev: 'r1',
    _createdAt: '2025-06-12T10:00:00Z',
    _updatedAt: '2025-06-12T10:00:00Z',
    photographer: 'Olav Nordmann',
    date: '2025-06-12',
    location: 'Grieghallen, Bergen',
    featured: true,
    image: {
      _type: 'image',
      asset: {
        _ref: `image-${id}${'0'.repeat(40 - id.length)}-1920x1080-jpg`,
        _type: 'reference',
      },
    },
    speakers: [],
  } as unknown as GalleryImageWithSpeakers
}

export const galleryImages = [1, 2, 3, 4].map(galleryImage)

const sponsorLogo = (label: string, color: string) =>
  `<svg viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg">` +
  `<text x="100" y="38" font-family="sans-serif" font-size="26" fill="${color}" text-anchor="middle">${label}</text>` +
  `</svg>`

export const sponsors = [
  {
    _id: 'cs-1',
    sponsor: {
      _id: 's-1',
      name: 'Acme Corporation',
      website: 'https://acme.example.com',
      logo: sponsorLogo('ACME', '#2563eb'),
    },
    tier: { title: 'Ingress', tagline: 'Premium' },
  },
  {
    _id: 'cs-2',
    sponsor: {
      _id: 's-2',
      name: 'Tech Solutions',
      website: 'https://tech.example.com',
      logo: sponsorLogo('TECH', '#10b981'),
    },
    tier: { title: 'Ingress', tagline: 'Premium' },
  },
  {
    _id: 'cs-3',
    sponsor: {
      _id: 's-3',
      name: 'Cloud Services',
      website: 'https://cloud.example.com',
      logo: sponsorLogo('CLOUD', '#8b5cf6'),
    },
    tier: { title: 'Pod', tagline: 'Base' },
  },
] as unknown as ConferenceSponsor[]

export const sponsorTiers = [
  {
    _id: 'tier-ingress',
    title: 'Ingress',
    tagline: 'Premium tier',
    tierType: 'standard' as const,
    price: [{ _key: 'p1', amount: 100000, currency: 'NOK' }],
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    soldOut: false,
    mostPopular: false,
  },
  {
    _id: 'tier-pod',
    title: 'Pod',
    tagline: 'Base tier',
    tierType: 'standard' as const,
    price: [{ _key: 'p2', amount: 25000, currency: 'NOK' }],
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    soldOut: false,
    mostPopular: false,
  },
]

export const organizers = [
  { _id: 'org-1', name: 'Ingrid Halvorsen', title: 'Programme chair' },
  { _id: 'org-2', name: 'Mateusz Nowak', title: 'Community lead' },
  { _id: 'org-3', name: 'Sara Lindqvist', title: 'Sponsorship' },
]

export const featuredSpeakers = [
  workshopSpeaker,
  plainSpeaker,
  shortRoleSpeaker,
]

/** One confirmed talk, optionally carrying a recording attachment. */
function talk(
  id: string,
  title: string,
  speaker: (typeof featuredSpeakers)[number],
  format: string,
  topic: string,
  withRecording = false,
): ProposalExisting {
  return {
    _id: id,
    title,
    status: 'confirmed',
    format,
    speakers: [speaker],
    topics: [{ _id: `topic-${topic}`, title: topic }],
    ...(withRecording
      ? {
          attachments: [
            {
              _key: `a-${id}`,
              _type: 'urlAttachment',
              attachmentType: 'recording',
              url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              title: 'Recording',
            },
          ],
        }
      : {}),
  } as unknown as ProposalExisting
}

function slot(
  start: string,
  end: string,
  proposal: ProposalExisting,
): Record<string, unknown> {
  return { startTime: start, endTime: end, hasTalkRef: true, talk: proposal }
}

/**
 * A published two-day schedule with real content in every dimension the
 * Program Highlights statistics band counts — sessions, speakers, workshops,
 * days, topics and tracks. Deliberately non-zero across the board: the band
 * drops zero-valued tiles, so a fixture with an empty dimension would silently
 * change the shape of the band it is meant to exercise.
 */
export function schedules(withRecordings = false) {
  return [
    {
      _id: 'sched-1',
      date: '2026-06-10',
      tracks: [
        {
          trackTitle: 'Main stage',
          trackDescription: 'Keynotes and headline talks',
          talks: [
            slot(
              '09:00',
              '09:45',
              talk(
                't1',
                'Running Kubernetes without a platform team',
                featuredSpeakers[0],
                'presentation_45',
                'Platform Engineering',
                withRecordings,
              ),
            ),
            slot(
              '10:00',
              '10:45',
              talk(
                't2',
                'What we learned migrating 400 services',
                featuredSpeakers[1],
                'presentation_45',
                'Migration',
                withRecordings,
              ),
            ),
          ],
        },
        {
          trackTitle: 'Workshops',
          trackDescription: 'Hands-on sessions',
          talks: [
            slot(
              '09:00',
              '11:00',
              talk(
                't3',
                'Build your own operator',
                featuredSpeakers[2],
                'workshop_120',
                'Operators',
                withRecordings,
              ),
            ),
          ],
        },
      ],
    },
    {
      _id: 'sched-2',
      date: '2026-06-11',
      tracks: [
        {
          trackTitle: 'Main stage',
          trackDescription: 'Keynotes and headline talks',
          talks: [
            slot(
              '09:00',
              '09:45',
              talk(
                't4',
                'Observability that survives an incident',
                featuredSpeakers[1],
                'presentation_45',
                'Observability',
                withRecordings,
              ),
            ),
          ],
        },
        {
          trackTitle: 'Workshops',
          trackDescription: 'Hands-on sessions',
          talks: [
            slot(
              '13:00',
              '15:00',
              talk(
                't5',
                'Debugging a cluster live',
                featuredSpeakers[0],
                'workshop_120',
                'Operations',
                withRecordings,
              ),
            ),
          ],
        },
      ],
    },
  ] as unknown as Conference['schedules']
}

// ── Conference fixtures, one per lifecycle state ────────────────────────────

/**
 * The floor: everything a brand-new organizer has entered on day one and
 * nothing else. No CFP dates, no programme date, no ticketing, no people, no
 * photos. This is the fixture the day-one design has to survive.
 */
export const dayOneConference = {
  _id: 'conf-day-one',
  title: 'Kubernetes Community Day Trondheim 2026',
  organizer: 'KCD Trondheim',
  tagline: 'Cloud native, in the north',
  description:
    'A one-day community conference for everyone building and running cloud native systems in mid-Norway.',
  city: 'Trondheim',
  country: 'Norway',
  venueName: 'Clarion Hotel Trondheim',
  venueAddress: 'Brattørkaia 1\n7010 Trondheim\nNorway',
  startDate: '2026-09-17',
  endDate: '2026-09-17',
  contactEmail: 'hello@kcdtrondheim.example',
  sponsorEmail: 'sponsors@kcdtrondheim.example',
  registrationEnabled: false,
  domains: ['kcdtrondheim.example'],
  formats: [],
  topics: [],
  organizers: [],
  socialLinks: [],
  sponsors: [],
  sponsorTiers: [],
} as unknown as Conference

/**
 * Day one plus the organizing team and the dates they have committed to — the
 * realistic second day of setup, and the state most new events actually sit in.
 */
export const announcedConference = {
  ...dayOneConference,
  _id: 'conf-announced',
  organizers,
  cfpStartDate: '2026-04-01',
  cfpEndDate: '2026-05-15',
  programDate: '2026-06-15',
} as unknown as Conference

/** CFP window open. Still a first edition: no photos, no speakers, no sponsors. */
export const cfpOpenConference = {
  ...announcedConference,
  _id: 'conf-cfp-open',
  cfpStartDate: '2026-02-01',
  cfpEndDate: '2026-04-15',
  registrationEnabled: true,
  registrationLink: 'https://tickets.example.com',
} as unknown as Conference

/** A returning edition mid-cycle: programme published, tickets on sale. */
export const midCycleConference = {
  ...dayOneConference,
  _id: 'conf-mid-cycle',
  title: 'Cloud Native Days Norway 2026',
  organizer: 'Cloud Native Days Norway',
  city: 'Bergen',
  venueName: 'Grieghallen',
  venueAddress: 'Edvard Griegs plass 1\n5015 Bergen\nNorway',
  startDate: '2026-06-10',
  endDate: '2026-06-11',
  cfpStartDate: '2025-11-01',
  cfpEndDate: '2026-01-15',
  programDate: '2026-02-15',
  registrationEnabled: true,
  registrationLink: 'https://tickets.example.com',
  organizers,
  featuredSpeakers,
  featuredTalks: [],
  schedules: schedules(),
  sponsors,
  sponsorTiers,
  featuredGalleryImages: galleryImages,
  vanityMetrics: [
    { label: 'Attendees', value: '450+' },
    { label: 'Speakers', value: '40' },
    { label: 'Tracks', value: '4' },
  ],
} as unknown as Conference

/**
 * Mid-cycle, but the vendor reports every active ticket type at zero.
 *
 * The conference document is deliberately identical to {@link midCycleConference} —
 * being sold out is something the TICKET VENDOR reports, never a field an
 * organizer sets — so the difference lives in the mocked ticket data, not here.
 * It still gets its own `_id`: a bare alias made the two fixtures the same
 * object, which knip flags as a duplicate export and which makes any test that
 * keys on `_id` unable to tell the two stories apart.
 */
export const soldOutConference = {
  ...midCycleConference,
  _id: 'conf-sold-out',
} as unknown as Conference

/** After the event, with photos and recordings to lead with. */
export const postEventConference = {
  ...midCycleConference,
  _id: 'conf-post-event',
  title: 'Cloud Native Days Norway 2025',
  startDate: '2025-06-10',
  endDate: '2025-06-11',
  cfpStartDate: '2024-11-01',
  cfpEndDate: '2025-01-15',
  programDate: '2025-02-15',
  schedules: schedules(true),
} as unknown as Conference

/** An edition called off. Explicit — no date can imply it. */
export const cancelledConference = {
  ...midCycleConference,
  _id: 'conf-cancelled',
  title: 'Cloud Native Days Amsterdam 2026',
  city: 'Amsterdam',
  country: 'Netherlands',
  venueName: 'Beurs van Berlage',
  lifecycleStatus: 'cancelled',
  lifecycleMessage:
    'After a great deal of deliberation we have decided not to run the 2026 edition. Everyone who bought a ticket has been refunded in full, and our sponsors have been contacted directly.\n\nWe intend to be back in 2027 — thank you for the support.',
  lifecycleLinkLabel: 'Read the full statement',
  lifecycleLinkHref: '/info',
} as unknown as Conference

/** Ended for good — the tombstone. */
export const archivedConference = {
  ...postEventConference,
  _id: 'conf-archived',
  title: 'The Strange Loop',
  organizer: 'Strange Loop',
  city: 'St. Louis',
  country: 'USA',
  lifecycleStatus: 'archived',
  lifecycleHeadline: 'The Strange Loop — 2009 to 2023',
  lifecycleMessage:
    'Strange Loop has ended. Fifteen years, thousands of attendees, and over a thousand talks — all of which remain online and free to watch.\n\nThank you to every speaker, volunteer, sponsor and attendee.',
  lifecycleLinkLabel: 'Browse the talk archive',
  lifecycleLinkHref: 'https://example.com/archive',
} as unknown as Conference
