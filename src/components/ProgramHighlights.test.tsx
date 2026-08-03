/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// next/link → a plain anchor so `Button href=…` renders in jsdom, with the
// analytics attributes forwarded (they are part of the band's contract).
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

// The promotion cards and the shared call-to-action are separately tested; here
// they stand in as markers so the assertions are about the BAND's structure —
// which strips it renders and which it suppresses.
vi.mock('@/components/TalkPromotionCard', () => ({
  TalkPromotionCard: ({
    talk,
    variant,
  }: {
    talk: { _id: string }
    variant?: string
  }) => (
    <div data-testid="talk-card" data-talk={talk._id} data-variant={variant} />
  ),
}))
vi.mock('@/components/SpeakerPromotionCard', () => ({
  SpeakerPromotionCard: ({
    speaker,
    variant,
  }: {
    speaker: { _id: string }
    variant?: string
  }) => (
    <div
      data-testid="speaker-card"
      data-speaker={speaker._id}
      data-variant={variant}
    />
  ),
}))
vi.mock('@/components/CallToAction', () => ({
  CallToAction: ({ title }: { title?: string }) => (
    <div data-testid="call-to-action" data-title={title} />
  ),
}))

import { ProgramHighlights } from './ProgramHighlights'
import type { Conference, ConferenceSchedule } from '@/lib/conference/types'
import type { SpeakerWithTalks } from '@/lib/speaker/types'
import { Flags } from '@/lib/speaker/types'
import type { ProposalExisting } from '@/lib/proposal/types'

/** The daily rotation of the spotlight slots is date-derived — pin the clock. */
const FIXED_NOW = new Date('2026-03-01T12:00:00Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function speaker(
  id: string,
  name: string,
  flags: Flags[] = [],
): SpeakerWithTalks {
  return {
    _id: id,
    name,
    title: 'Platform engineer',
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    flags,
  } as unknown as SpeakerWithTalks
}

function talk(
  id: string,
  title: string,
  format: string,
  topics: string[],
  speakers: SpeakerWithTalks[],
): ProposalExisting {
  return {
    _id: id,
    title,
    format,
    status: 'confirmed',
    topics: topics.map((t, i) => ({ _id: `${id}-t${i}`, title: t })),
    speakers,
  } as unknown as ProposalExisting
}

const ada = speaker('sp-ada', 'Ada Lovelace', [Flags.localSpeaker])
const bjorn = speaker('sp-bjorn', 'Bjørn Olsen', [Flags.firstTimeSpeaker])
const marte = speaker('sp-marte', 'Marte Vik')

const talks = [
  talk(
    'tk-1',
    'Running Kubernetes on a budget',
    'presentation_45',
    ['Kubernetes', 'FinOps'],
    [ada],
  ),
  talk(
    'tk-2',
    'OpenTelemetry in anger',
    'presentation_25',
    ['Observability'],
    [bjorn],
  ),
  talk(
    'tk-3',
    'Building a platform team that lasts',
    'presentation_45',
    ['Platform Engineering'],
    [marte],
  ),
  talk(
    'tk-4',
    'Cilium from first principles',
    'workshop_120',
    ['Networking'],
    [ada, marte],
  ),
]

const schedules: ConferenceSchedule[] = [
  {
    _id: 'sched-1',
    date: '2026-10-27',
    tracks: [
      {
        trackTitle: 'Platform Engineering',
        talks: [
          { startTime: '09:00', endTime: '09:45', talk: talks[0] },
          { startTime: '10:00', endTime: '10:25', talk: talks[1] },
        ],
      },
      {
        trackTitle: 'Observability',
        talks: [
          { startTime: '09:00', endTime: '09:45', talk: talks[2] },
          { startTime: '11:00', endTime: '13:00', talk: talks[3] },
        ],
      },
    ],
  },
] as unknown as ConferenceSchedule[]

function makeConference(overrides: Partial<Conference> = {}): Conference {
  return {
    _id: 'conf-1',
    title: 'Cloud Native Days Bergen',
    startDate: '2026-10-27',
    endDate: '2026-10-28',
    registrationEnabled: true,
    registrationLink: 'https://tickets.example.com',
    ...overrides,
  } as unknown as Conference
}

function renderBand(
  props: Partial<Parameters<typeof ProgramHighlights>[0]> = {},
) {
  return render(
    <ProgramHighlights
      schedules={schedules}
      featuredTalks={[talks[0]]}
      featuredSpeakers={[ada]}
      conference={makeConference()}
      {...props}
    />,
  )
}

/**
 * BACK-COMPAT TRIPWIRE. Captured from the PRE-VARIANT component: the DEFAULT
 * (`full`) rendering is what the live conference sites get. A diff here means
 * the default path regressed — fix the code, never `vitest -u`.
 */
describe('ProgramHighlights — default (full) markup is frozen', () => {
  it('renders the whole programme band', () => {
    const { container } = renderBand()
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders nothing without a schedule', () => {
    const { container } = renderBand({ schedules: [] })
    expect(container.innerHTML).toBe('')
  })
})

describe('ProgramHighlights — variant resolution', () => {
  it('renders an explicit `full` identically to no variant at all', () => {
    const { container: implicit } = renderBand()
    const withoutVariant = implicit.innerHTML
    cleanup()
    const { container: explicit } = renderBand({ variant: 'full' })
    expect(explicit.innerHTML).toBe(withoutVariant)
  })

  it('falls back to the full band for a variant from the future', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container: implicit } = renderBand()
    const withoutVariant = implicit.innerHTML
    cleanup()
    const { container: unknown } = renderBand({ variant: 'poster' as 'full' })
    expect(unknown.innerHTML).toBe(withoutVariant)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('ProgramHighlights — talks variant', () => {
  it('suppresses the statistics tiles', () => {
    const { container: full } = renderBand()
    expect(full.textContent).toContain('Sessions')
    expect(full.textContent).toContain('Tracks')
    cleanup()
    const { container } = renderBand({ variant: 'talks' })
    const text = container.textContent ?? ''
    expect(text).not.toContain('Tracks')
    expect(text).not.toContain('Topics')
    expect(container.querySelectorAll('dt')).toHaveLength(0)
  })

  it('suppresses the local/first-time speaker strip', () => {
    const { container: full } = renderBand()
    expect(full.textContent).toContain('Local Speakers')
    expect(full.textContent).toContain('First Timers')
    cleanup()
    const { container } = renderBand({ variant: 'talks' })
    expect(container.textContent).not.toContain('Local Speakers')
    expect(container.textContent).not.toContain('First Timers')
  })

  it('suppresses the trailing marketing call-to-action block', () => {
    const { queryByTestId: fullQuery } = renderBand()
    expect(fullQuery('call-to-action')).toBeTruthy()
    cleanup()
    const { queryByTestId } = renderBand({ variant: 'talks' })
    expect(queryByTestId('call-to-action')).toBeNull()
  })

  it('keeps every talk and speaker card the full band renders', () => {
    const { container: full } = renderBand()
    const fullTalks = full.querySelectorAll('[data-testid="talk-card"]').length
    const fullSpeakers = full.querySelectorAll(
      '[data-testid="speaker-card"]',
    ).length
    cleanup()
    const { container } = renderBand({ variant: 'talks' })
    expect(
      container.querySelectorAll('[data-testid="talk-card"]'),
    ).toHaveLength(fullTalks)
    expect(
      container.querySelectorAll('[data-testid="speaker-card"]'),
    ).toHaveLength(fullSpeakers)
  })

  it('keeps the heading, the spotlight chrome and the programme links', () => {
    const { container, getAllByRole } = renderBand({ variant: 'talks' })
    const text = container.textContent ?? ''
    expect(text).toContain('Program Highlights')
    expect(text).toContain('Don')
    expect(
      getAllByRole('link').some((a) => a.getAttribute('href') === '/program'),
    ).toBe(true)
  })

  it('still removes itself when the published schedule holds no talks', () => {
    const { container } = renderBand({
      variant: 'talks',
      schedules: [
        { _id: 's', date: '2026-10-27', tracks: [] },
      ] as unknown as ConferenceSchedule[],
    })
    expect(container.innerHTML).toBe('')
  })
})
