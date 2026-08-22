/**
 * @vitest-environment node
 *
 * DAY ONE, PUBLIC SIDE. `@/lib/onboarding/create.ts` provisions a tenant with a
 * title, an org reference, a city/country, contact addresses and nothing else:
 * no tagline, no dates, no venue, no schedule, no speakers. Two public pages
 * used to fill that silence with copy of their own —
 *
 *   - `/speaker` headed an empty grid with "Meet our 0 speakers" over a
 *     paragraph about "these industry experts" (reachable from the `/tickets`
 *     coming-soon card, which links "View Speakers" straight here);
 *   - `/info` asserted a date ("held on TBD", from `formatDate('')`), a
 *     registration time, a start and end time, catering and an afterparty
 *     starting at 6 PM.
 *
 * None of it came from the organizer. This suite builds the conference document
 * with the REAL `buildOnboardingDocuments`, pushes it through the real
 * `getConferenceForDomain` boundary and walks both pages — so if provisioning
 * ever starts seeding these fields, the premise guards below fail loudly rather
 * than the coverage quietly evaporating.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

const conferenceFetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: (...args: unknown[]) => conferenceFetchMock(...args) },
  clientReadCached: {
    fetch: (...args: unknown[]) => conferenceFetchMock(...args),
  },
  clientReadUncached: {
    fetch: (...args: unknown[]) => conferenceFetchMock(...args),
  },
}))

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ host: FRESH_HOST })),
}))

vi.mock('@/lib/gallery/sanity', () => ({
  getGalleryImages: vi.fn(async () => []),
  getFeaturedGalleryImages: vi.fn(async () => []),
}))

vi.mock('@/lib/sponsor-crm/sanity', () => ({
  getPublicSponsorsForConference: vi.fn(async () => []),
}))

const getSpeakersMock = vi.fn()
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeakers: (...args: unknown[]) => getSpeakersMock(...args),
}))

import { buildOnboardingDocuments } from '@/lib/onboarding/create'
import { getScheduleDayInfo } from '@/lib/conference/info-faq'
import type { ConferenceSchedule } from '@/lib/conference/types'
import SpeakerPage from '@/app/(main)/speaker/page'
import InfoPage from '@/app/(main)/info/page'

const FRESH_HOST = 'brand-new.konf.run'

/** The conference document a concierge provisioning run actually writes. */
function provisionedConferenceDocument() {
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
      domains: [FRESH_HOST],
    },
    {
      organizationId: 'org-fresh',
      conferenceId: 'conf-fresh',
      speakerId: 'speaker-fresh',
      mintKey: () => `key-${++key}`,
    },
    null,
  )
  return conference
}

/**
 * Both pages are server components wrapping ONE async child that reads the
 * conference. Awaiting the page yields that child's element; awaiting the child
 * gives a tree of ordinary components `renderToStaticMarkup` can finish.
 */
async function renderPage(page: () => Promise<ReactElement>): Promise<string> {
  const pageElement = (await page()) as ReactElement<{ domain: string }>
  const inner = await (
    pageElement.type as (props: {
      domain: string
    }) => Promise<ReactElement | null>
  )(pageElement.props)
  return inner === null ? '' : renderToStaticMarkup(inner)
}

beforeEach(() => {
  vi.clearAllMocks()
  getSpeakersMock.mockResolvedValue({ speakers: [], err: null })
  conferenceFetchMock.mockResolvedValue(provisionedConferenceDocument())
})

describe('what provisioning actually writes', () => {
  it('omits the tagline, the dates, the venue and the schedule', () => {
    // Guards the premise: if this fails, everything below is testing a
    // scenario that no longer exists and should be rewritten, not updated.
    const doc = provisionedConferenceDocument()
    expect(doc.tagline).toBeUndefined()
    expect(doc.startDate).toBeUndefined()
    expect(doc.endDate).toBeUndefined()
    expect(doc.venueName).toBeUndefined()
    expect(doc.venueAddress).toBeUndefined()
    expect(doc.schedules).toBeUndefined()
    // ...but it does write a title and a contact address, which is what the
    // day-one copy leans on.
    expect(doc.title).toBe('Brand New Conf')
    expect(doc.contactEmail).toBe('hello@brand-new.example')
  })
})

describe('/speaker before the first speaker is announced', () => {
  it('does not count an empty grid', async () => {
    const html = await renderPage(SpeakerPage)

    expect(html).not.toContain('Meet our 0 speakers')
    expect(html).not.toContain('These industry experts')
  })

  it('says so, and offers the organizers instead', async () => {
    const html = await renderPage(SpeakerPage)

    expect(html).toContain('Speakers have not been announced yet')
    expect(html).toContain('hello@brand-new.example')
  })

  it('does not push a CFP that cannot accept a proposal', async () => {
    // The CFP window is closed AND no format is configured — a "submit a talk"
    // link here would land on a form with an empty format dropdown (#824).
    const html = await renderPage(SpeakerPage)

    expect(html).not.toContain('call for presentations')
  })
})

describe('/speaker once speakers exist', () => {
  function speaker(id: string, name: string) {
    return { _id: id, name, slug: id, title: 'Speaker', proposals: [] }
  }

  it('counts the first speaker in the singular', async () => {
    getSpeakersMock.mockResolvedValue({
      speakers: [speaker('spk-1', 'Grace Hopper')],
      err: null,
    })

    const html = await renderPage(SpeakerPage)

    expect(html).toContain('Meet our 1 speaker<')
    expect(html).not.toContain('Meet our 1 speakers')
    expect(html).toContain('Grace Hopper')
    expect(html).not.toContain('Speakers have not been announced yet')
  })

  it('counts the rest in the plural, and renders the grid', async () => {
    getSpeakersMock.mockResolvedValue({
      speakers: [
        speaker('spk-1', 'Grace Hopper'),
        speaker('spk-2', 'Barbara Liskov'),
      ],
      err: null,
    })

    const html = await renderPage(SpeakerPage)

    expect(html).toContain('Meet our 2 speakers')
    expect(html).toContain('Grace Hopper')
    expect(html).toContain('Barbara Liskov')
  })
})

describe('/info asserts nothing the organizer did not configure', () => {
  it('never renders the "TBD" date placeholder as prose', async () => {
    const html = await renderPage(InfoPage)

    expect(html).not.toContain('TBD')
    expect(html).not.toContain('will be held on')
  })

  it('invents no registration, start or end times', async () => {
    const html = await renderPage(InfoPage)

    expect(html).not.toContain('Registration opens at')
    expect(html).not.toContain('Doors open for registration')
    // The badge answer is nothing BUT a registration time, so it goes too.
    expect(html).not.toContain('When and where can I pick up my badge?')
    expect(html).not.toContain('08:00')
    expect(html).not.toContain('09:00')
    expect(html).not.toContain('17:00')
  })

  it('promises no food and no afterparty', async () => {
    const html = await renderPage(InfoPage)

    expect(html).not.toContain('We will serve food and drinks')
    expect(html).not.toContain('afterparty')
  })

  it('claims nothing about a venue that has not been booked', async () => {
    const html = await renderPage(InfoPage)

    expect(html).not.toContain('take place at the venue')
    expect(html).not.toContain('the venue is accessible')
    // The city IS configured, so that much is still answered.
    expect(html).toContain('Bergen, Norway')
  })

  it('keeps the answers that are true for every conference', async () => {
    const html = await renderPage(InfoPage)

    expect(html).toContain('What is the code of conduct?')
    expect(html).toContain('allergies or dietary restrictions')
  })
})

describe('/info for a conference that HAS configured its event', () => {
  it('answers the date and the running times again', async () => {
    conferenceFetchMock.mockResolvedValue({
      ...provisionedConferenceDocument(),
      startDate: '2026-10-27',
      venueName: 'Grieghallen',
      schedules: [
        {
          _id: 'sched-1',
          date: '2026-10-27',
          tracks: [
            {
              trackTitle: 'Main track',
              trackDescription: '',
              talks: [
                {
                  placeholder: 'Registration',
                  startTime: '07:30',
                  endTime: '08:45',
                },
                {
                  placeholder: 'Closing',
                  startTime: '16:00',
                  endTime: '16:45',
                },
              ],
            },
          ],
        },
      ],
    })

    const html = await renderPage(InfoPage)

    expect(html).toContain('The conference will be held on')
    expect(html).toContain('07:30')
    expect(html).toContain('16:45')
    expect(html).toContain('Grieghallen')
    expect(html).toContain('When will the doors open?')
    expect(html).toContain('When and where can I pick up my badge?')
    expect(html).toContain('Is this venue accessible?')
  })
})

/**
 * THE SECOND ROUTE TO THE SAME LIE. Creating the schedule day is an early
 * setup step — earlier than filling it in — so "a schedule document with
 * nothing in it" is a likelier state than "no schedule document". For such a
 * day `getScheduleDayInfo` still hands back `08:00 / 09:00 / 17:00`, which is
 * why the answers gate on `hasRealTimes` and not on the day's existence.
 */
describe('/info for a conference whose schedule day is EMPTY', () => {
  function emptyScheduleDocument(overrides: Record<string, unknown> = {}) {
    return {
      _id: 'sched-empty',
      date: '2026-10-27',
      tracks: [{ trackTitle: 'Main track', trackDescription: '', talks: [] }],
      ...overrides,
    }
  }

  it('getScheduleDayInfo really does invent times for it', () => {
    // Guards the premise: the gate exists because of exactly these values.
    const info = getScheduleDayInfo([
      emptyScheduleDocument() as unknown as ConferenceSchedule,
    ])

    expect(info.days).toHaveLength(1)
    expect(info.conferenceDay?.registrationTime).toBe('08:00')
    expect(info.conferenceDay?.startTime).toBe('09:00')
    expect(info.conferenceDay?.endTime).toBe('17:00')
    expect(info.conferenceDay?.hasRealTimes).toBe(false)
  })

  it('publishes none of those invented times', async () => {
    conferenceFetchMock.mockResolvedValue({
      ...provisionedConferenceDocument(),
      startDate: '2026-10-27',
      schedules: [emptyScheduleDocument()],
    })

    const html = await renderPage(InfoPage)

    expect(html).not.toContain('08:00')
    expect(html).not.toContain('09:00')
    expect(html).not.toContain('17:00')
    expect(html).not.toContain('Registration opens at')
    expect(html).not.toContain('When will the doors open?')
    expect(html).not.toContain('When and where can I pick up my badge?')
    // The date is real, so it survives on its own.
    expect(html).toContain('The conference will be held on')
  })

  it('survives a schedule document with no tracks at all', async () => {
    // `tracks` is typed non-optional; a half-created document does not have it,
    // and `/info` has no error boundary above it.
    conferenceFetchMock.mockResolvedValue({
      ...provisionedConferenceDocument(),
      schedules: [{ _id: 'sched-bare', date: '2026-10-27' }],
    })

    const html = await renderPage(InfoPage)

    expect(html).toContain('For Attendees')
    expect(html).not.toContain('08:00')
  })

  it('drops the two-day answers when only ONE of the days is filled in', async () => {
    conferenceFetchMock.mockResolvedValue({
      ...provisionedConferenceDocument(),
      startDate: '2026-10-27',
      endDate: '2026-10-28',
      schedules: [
        {
          _id: 'sched-1',
          date: '2026-10-27',
          tracks: [
            {
              trackTitle: 'Workshops',
              trackDescription: '',
              talks: [
                {
                  placeholder: 'Registration',
                  startTime: '07:30',
                  endTime: '08:45',
                },
              ],
            },
          ],
        },
        emptyScheduleDocument({ _id: 'sched-2', date: '2026-10-28' }),
      ],
    })

    const html = await renderPage(InfoPage)

    // The empty second day is the "conference day", so nothing timed is safe.
    expect(html).not.toContain('08:00')
    expect(html).not.toContain('Day 1 (')
    expect(html).not.toContain('When will the doors open?')
    // The span between the two configured dates is still true.
    expect(html).toContain('This is a multi-day event running from')
  })
})
