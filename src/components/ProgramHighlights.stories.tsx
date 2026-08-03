import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ProgramHighlights } from './ProgramHighlights'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import {
  Audience,
  Format,
  Language,
  Level,
  Status,
  type ProposalExisting,
} from '@/lib/proposal/types'
import { Flags, type SpeakerWithTalks } from '@/lib/speaker/types'
import type { Conference, ConferenceSchedule } from '@/lib/conference/types'

/**
 * The programme band, in both variants. `full` (the default) leads with the
 * statistics tiles; `talks` drops them — plus the local/first-timer strip and
 * the trailing marketing block — and keeps the sessions, the speakers and the
 * programme links.
 *
 * `TalksSmallEvent` is the motivating case: a one-day, six-session community
 * event, where the statistics band prints numbers that UNDERSELL a good
 * programme. Compare it with `FullSmallEvent` — same data, both variants.
 */

/* ----------------------------- speaker portraits ------------------------ */

const PORTRAITS: Record<string, [string, string]> = {
  'sp-ada': ['#1d4ed8', 'AL'],
  'sp-bjorn': ['#0f766e', 'BO'],
  'sp-marte': ['#6d28d9', 'MV'],
  'sp-erik': ['#b45309', 'ES'],
  'sp-priya': ['#be123c', 'PR'],
}

/** A flat portrait plate, at the 4:5 crop the cards use. */
function portraitSvg(bg: string, initials: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800">` +
    `<rect width="640" height="800" fill="${bg}"/>` +
    `<circle cx="320" cy="300" r="130" fill="#ffffff" opacity="0.22"/>` +
    `<ellipse cx="320" cy="640" rx="215" ry="185" fill="#ffffff" opacity="0.22"/>` +
    `<text x="320" y="330" font-family="sans-serif" font-size="120" font-weight="700" fill="#ffffff" text-anchor="middle">${initials}</text>` +
    `</svg>`
  )
}

/**
 * Portraits are served locally rather than fetched: the shoot has to be
 * deterministic and offline-safe, and a broken portrait would hide exactly the
 * layout problems these captures exist to find.
 */
const handlers = [
  http.get('https://cdn.sanity.io/images/*', ({ request }) => {
    const path = new URL(request.url).pathname
    const id = Object.keys(PORTRAITS).find((key) =>
      path.includes(key.replace('sp-', '')),
    )
    const [bg, initials] = PORTRAITS[id ?? 'sp-ada']
    return new HttpResponse(portraitSvg(bg, initials), {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  }),
]

/* --------------------------------- people ------------------------------- */

function assetRef(id: string): string {
  const stem = id.replace('sp-', '')
  return `image-${stem.repeat(40).slice(0, 40)}-640x800-jpg`
}

function speaker(
  id: string,
  name: string,
  title: string,
  bio: string,
  flags: Flags[] = [],
): SpeakerWithTalks {
  return {
    _id: id,
    _rev: '1',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    name,
    email: `${id}@example.com`,
    slug: name.toLowerCase().replace(/[^a-z]+/g, '-'),
    title,
    bio: convertStringToPortableTextBlocks(bio),
    image: {
      _type: 'image',
      asset: { _ref: assetRef(id), _type: 'reference' },
    },
    flags,
  } as unknown as SpeakerWithTalks
}

const ada = speaker(
  'sp-ada',
  'Ada Lindqvist',
  'Principal Platform Engineer at Vipps',
  'Ada has spent six years turning a 200-service Kubernetes estate into something an on-call engineer can sleep through.',
  [Flags.localSpeaker],
)
const bjorn = speaker(
  'sp-bjorn',
  'Bjørn-Kristian Aleksandersen',
  'Senior Site Reliability Engineer at Telenor',
  'Bjørn keeps Norway’s largest mobile network observable, and has opinions about cardinality.',
  [Flags.firstTimeSpeaker],
)
const marte = speaker(
  'sp-marte',
  'Marte Vik',
  'Staff Engineer at NAV',
  'Marte builds the internal developer platform used by 1 200 engineers in Norwegian public services.',
  [Flags.localSpeaker],
)
const erik = speaker(
  'sp-erik',
  'Erik Sørensen',
  'CTO at Nordcloud',
  'Erik has migrated more datacentres than he cares to count, and would like to talk about the ones that failed.',
)
const priya = speaker(
  'sp-priya',
  'Priya Raman',
  'Cloud Native Advocate at Fastly',
  'Priya works on edge compute, and on convincing people that the edge is not magic.',
  [Flags.firstTimeSpeaker],
)

/* --------------------------------- talks -------------------------------- */

function talk(
  id: string,
  title: string,
  description: string,
  format: Format,
  level: Level,
  topics: string[],
  speakers: SpeakerWithTalks[],
): ProposalExisting {
  return {
    _id: id,
    _rev: '1',
    _type: 'talk',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    title,
    description: convertStringToPortableTextBlocks(description),
    language: Language.english,
    format,
    level,
    audiences: [Audience.developer, Audience.architect],
    status: Status.confirmed,
    outline: '',
    tos: true,
    topics: topics.map((t, i) => ({
      _id: `${id}-topic-${i}`,
      _type: 'topic' as const,
      title: t,
      slug: { current: t.toLowerCase().replace(/[^a-z]+/g, '-') },
      color: '326CE5',
    })),
    speakers,
    conference: { _id: 'conf-1', _ref: 'conf-1', _type: 'reference' },
  } as unknown as ProposalExisting
}

const talks = [
  talk(
    'tk-cost',
    'What our Kubernetes bill taught us about our architecture',
    'A year of FinOps data, read as an architecture review. The expensive parts of the cluster turned out to be the parts nobody owned — here is how we found them, and what we deleted.',
    Format.presentation_45,
    Level.intermediate,
    ['Kubernetes', 'FinOps'],
    [ada],
  ),
  talk(
    'tk-otel',
    'OpenTelemetry in anger: three outages, one trace',
    'Traces are wonderful until the bill arrives and the sampling hides the incident. Three real outages at Telenor, and what the instrumentation had to look like to catch each one.',
    Format.presentation_25,
    Level.intermediate,
    ['Observability'],
    [bjorn],
  ),
  talk(
    'tk-platform',
    'Building a platform team that outlives its founders',
    'NAV’s internal platform is nine years old and on its fourth generation of maintainers. The talk is about the handovers, not the technology.',
    Format.presentation_45,
    Level.beginner,
    ['Platform Engineering'],
    [marte],
  ),
  talk(
    'tk-cilium',
    'Cilium from first principles',
    'A hands-on afternoon: eBPF, network policy and what actually happens to a packet between two pods. Bring a laptop with kind installed.',
    Format.workshop_120,
    Level.advanced,
    ['Networking', 'eBPF'],
    [ada, marte],
  ),
  talk(
    'tk-edge',
    'Running the edge without running a datacentre',
    'Edge compute is a deployment topology, not a product category. What moves, what stays, and the four failure modes nobody warns you about.',
    Format.presentation_25,
    Level.intermediate,
    ['Edge', 'WebAssembly'],
    [priya],
  ),
  talk(
    'tk-migration',
    'The migration we abandoned, and what it cost',
    'A post-mortem of a two-year lift-and-shift that was stopped at eighteen months, told with the numbers the board saw.',
    Format.presentation_20,
    Level.beginner,
    ['Migration', 'Strategy'],
    [erik],
  ),
]

function slot(startTime: string, endTime: string, proposal: ProposalExisting) {
  return { startTime, endTime, talk: proposal, hasTalkRef: true }
}

const schedules = [
  {
    _id: 'sched-day-1',
    date: '2026-10-27',
    tracks: [
      {
        trackTitle: 'Platform Engineering',
        trackDescription: 'Grieghallen, Peer Gynt',
        talks: [
          slot('09:15', '10:00', talks[0]),
          slot('10:15', '11:00', talks[2]),
          slot('13:00', '15:00', talks[3]),
        ],
      },
      {
        trackTitle: 'Observability',
        trackDescription: 'Grieghallen, Klokkeklang',
        talks: [
          slot('09:15', '09:40', talks[1]),
          slot('10:15', '10:40', talks[4]),
          slot('11:00', '11:20', talks[5]),
        ],
      },
    ],
  },
  {
    _id: 'sched-day-2',
    date: '2026-10-28',
    tracks: [
      {
        trackTitle: 'Platform Engineering',
        trackDescription: 'Grieghallen, Peer Gynt',
        talks: [slot('09:15', '10:00', talks[2])],
      },
    ],
  },
] as unknown as ConferenceSchedule[]

/** A one-day, six-session community event — the case `talks` exists for. */
const smallSchedules = [
  {
    _id: 'sched-small',
    date: '2026-05-14',
    tracks: [
      {
        trackTitle: 'Single track',
        trackDescription: 'Bergen Public Library',
        talks: [
          slot('17:00', '17:25', talks[1]),
          slot('17:30', '17:50', talks[5]),
          slot('18:00', '18:25', talks[4]),
        ],
      },
    ],
  },
] as unknown as ConferenceSchedule[]

const conference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Bergen 2026',
  organizer: 'Cloud Native Bergen',
  city: 'Bergen',
  country: 'Norway',
  venueName: 'Grieghallen',
  startDate: '2026-10-27',
  endDate: '2026-10-28',
  registrationEnabled: true,
  registrationLink: 'https://tickets.example.com',
  contactEmail: 'hei@example.com',
  domains: ['2026.cloudnativebergen.dev'],
} as unknown as Conference

const meta = {
  title: 'Systems/Homepage/Public/ProgramHighlights',
  component: ProgramHighlights,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'The programme band. `full` (the default) leads with the statistics tiles — sessions, speakers, workshops, days, topics, tracks — plus the local/first-time speaker strip and the shared marketing call-to-action. `talks` drops exactly those three pieces and keeps everything else: the spotlight pair, every session and speaker card, and the programme/speaker/ticket links. The statistics band is the loudest element on the page, and for a small event it prints numbers that undersell a genuinely good programme.',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'radio',
      options: [undefined, 'full', 'talks'],
      description: 'Presentation variant. Absent = `full` (the default).',
    },
    schedules: { control: false },
    featuredTalks: { control: false },
    featuredSpeakers: { control: false },
    conference: { control: false },
  },
  args: {
    schedules,
    featuredTalks: [talks[0]],
    featuredSpeakers: [ada],
    conference,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ProgramHighlights>

export default meta
type Story = StoryObj<typeof meta>

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

/* ------------------------------ full (default) -------------------------- */

export const Default: Story = {}

export const Dark: Story = { ...dark }

/** The same band for a small event: six sessions, one day, one track. */
export const FullSmallEvent: Story = {
  args: {
    schedules: smallSchedules,
    featuredTalks: [talks[1]],
    featuredSpeakers: [bjorn],
  },
}

/* --------------------------------- talks -------------------------------- */

/**
 * `talks`: no statistics tiles, no local/first-timer strip, no trailing
 * marketing block. Every talk and speaker card the full band renders is still
 * here, and so are the programme, speakers and tickets links.
 */
export const Talks: Story = {
  args: { variant: 'talks' },
}

export const TalksDark: Story = {
  ...dark,
  args: { variant: 'talks' },
}

/** The motivating case: the same small event, without the underselling numbers. */
export const TalksSmallEvent: Story = {
  args: {
    variant: 'talks',
    schedules: smallSchedules,
    featuredTalks: [talks[1]],
    featuredSpeakers: [bjorn],
  },
}
