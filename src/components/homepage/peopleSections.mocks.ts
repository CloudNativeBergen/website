import type { Conference } from '@/lib/conference/types'
import type { SpeakerWithTalks } from '@/lib/speaker/types'
import { mockFeaturedSpeakers } from '@/components/featuredSpeakers.mocks'

/**
 * Fixtures for the featured-speakers and organizers VARIANT stories.
 *
 * Both bands are variant-sensitive to team SIZE — the whole argument for the
 * `grid` and `compact` variants is what happens once a shelf has more speakers
 * than it can peek at, and once an organizing team outgrows a wall of cards.
 * So the rosters here are deliberately large (10 speakers, 12 organizers)
 * rather than the three-person fixtures the lifecycle stories use.
 */

/** Square portrait placeholder — organizers render in a round 56px frame. */
const square = (bg: string, label: string) =>
  `https://placehold.co/224x224/${bg}/ffffff?text=${encodeURIComponent(label)}`

/** Portrait (4:5) placeholder matching the speaker tile's crop. */
const portrait = (bg: string, label: string) =>
  `https://placehold.co/640x800/${bg}/ffffff?text=${encodeURIComponent(label)}`

const speaker = (
  id: string,
  name: string,
  slug: string,
  title: string,
  image?: string,
): SpeakerWithTalks =>
  ({
    _id: id,
    _rev: '1',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    email: `${slug}@example.com`,
    name,
    slug,
    title,
    image,
    talks: [],
  }) as unknown as SpeakerWithTalks

/**
 * Ten featured speakers: the five shared tile fixtures (which already cover a
 * very long title, a missing image and a workshop badge) plus five more, so the
 * grid has enough people to actually fill its widest row.
 */
export const manyFeaturedSpeakers: SpeakerWithTalks[] = [
  ...mockFeaturedSpeakers,
  speaker(
    'sp-6',
    'Priya Raghunathan',
    'priya-raghunathan',
    'Distinguished Engineer at Equinor',
    portrait('be123c', 'Priya'),
  ),
  speaker(
    'sp-7',
    'Tomás Herrera',
    'tomas-herrera',
    'Head of Platform at Mercado Libre',
    portrait('0891b2', 'Tomas'),
  ),
  speaker(
    'sp-8',
    'Ingrid Halvorsen',
    'ingrid-halvorsen',
    'Site Reliability Engineer at Vipps MobilePay',
    portrait('7c3aed', 'Ingrid'),
  ),
  speaker(
    'sp-9',
    'Kwame Mensah',
    'kwame-mensah',
    'Open Source Program Lead at Grafana Labs',
    portrait('ea580c', 'Kwame'),
  ),
  speaker(
    'sp-10',
    'Yuki Tanaka',
    'yuki-tanaka',
    'Kernel Engineer at Isovalent',
    portrait('0f766e', 'Yuki'),
  ),
]

/**
 * A twelve-person organizing committee — the size at which the `cards` variant
 * stops being a section and starts being the page, which is the case `compact`
 * exists for. Deliberately includes two people with no portrait (the initials
 * fallback), one very long role, and non-ASCII names so the sort and the
 * truncation are both exercised on screen.
 */
export const largeOrganizingTeam: SpeakerWithTalks[] = [
  speaker(
    'org-1',
    'Ada Bjørnstad',
    'ada-bjornstad',
    'Programme chair',
    square('1d4ed8', 'Ada'),
  ),
  speaker(
    'org-2',
    'Mateusz Nowak',
    'mateusz-nowak',
    'Community lead at Bekk',
    square('10b981', 'Mateusz'),
  ),
  speaker(
    'org-3',
    'Sara Lindqvist',
    'sara-lindqvist',
    'Sponsorship and partnerships',
    square('6366f1', 'Sara'),
  ),
  speaker('org-4', 'Chen Wei', 'chen-wei', 'Volunteer coordinator'),
  speaker(
    'org-5',
    'Åsa Nordmann',
    'asa-nordmann',
    'Speaker liaison and accessibility',
    square('facc15', 'Asa'),
  ),
  speaker(
    'org-6',
    'Dana Okoro',
    'dana-okoro',
    'Head of Programme Committee and Content Curation',
    square('be123c', 'Dana'),
  ),
  speaker(
    'org-7',
    'Erik Sørensen',
    'erik-sorensen',
    'Venue and logistics',
    square('0891b2', 'Erik'),
  ),
  speaker('org-8', 'Fatima Al-Hassan', 'fatima-al-hassan', 'Finance'),
  speaker(
    'org-9',
    'Henrik Lund',
    'henrik-lund',
    'Audio-visual at NRK',
    square('7c3aed', 'Henrik'),
  ),
  speaker(
    'org-10',
    'Nina Petrova',
    'nina-petrova',
    'Diversity and inclusion',
    square('ea580c', 'Nina'),
  ),
  speaker(
    'org-11',
    'Olav Haugen',
    'olav-haugen',
    'Website and ticketing',
    square('0f766e', 'Olav'),
  ),
  speaker(
    'org-12',
    'Yuki Tanaka',
    'yuki-tanaka-org',
    'Workshops',
    square('db2777', 'Yuki'),
  ),
]

/**
 * A mid-cycle conference (programme published, tickets on sale) so the bands
 * render their pre-event phase CTA row — the state a visitor most often meets
 * these sections in.
 */
export const peopleConference = {
  _id: 'conf-people',
  title: 'Cloud Native Days Norway 2026',
  organizer: 'Cloud Native Days Norway',
  city: 'Bergen',
  country: 'Norway',
  venueName: 'Grieghallen',
  startDate: '2099-06-10',
  endDate: '2099-06-11',
  programDate: '2020-02-15',
  cfpStartDate: '2019-11-01',
  cfpEndDate: '2020-01-15',
  registrationEnabled: true,
  registrationLink: 'https://tickets.example.com',
  domains: ['2026.cloudnativedays.no'],
  formats: [],
  topics: [],
  socialLinks: [],
  sponsors: [],
  sponsorTiers: [],
  featuredSpeakers: manyFeaturedSpeakers,
  organizers: largeOrganizingTeam,
  schedules: [
    {
      _id: 'sched-1',
      date: '2099-06-10',
      tracks: [
        {
          trackTitle: 'Main stage',
          trackDescription: 'Keynotes',
          talks: [
            {
              startTime: '09:00',
              endTime: '09:45',
              hasTalkRef: true,
              talk: { _id: 't1', status: 'confirmed' },
            },
          ],
        },
      ],
    },
  ],
} as unknown as Conference
