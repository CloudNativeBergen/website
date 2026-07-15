import {
  buildEventJsonLd,
  performersFromSchedules,
  serializeJsonLd,
  type EventPerformer,
} from '../eventJsonLd'
import type { Conference, ConferenceSchedule } from '@/lib/conference/types'
import { Status } from '@/lib/proposal/types'

/**
 * Minimal conference factory. Registration defaults to available (enabled +
 * link + far-future end date) so `offers` is emitted unless a test overrides
 * these fields.
 */
function makeConference(overrides: Partial<Conference> = {}): Conference {
  return {
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
    ...overrides,
  } as unknown as Conference
}

describe('buildEventJsonLd', () => {
  it('maps full conference data to a complete, valid Event object', () => {
    const jsonLd = buildEventJsonLd({
      conference: makeConference(),
      domain: 'cloudnativebergen.dev',
    })

    expect(jsonLd).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'Cloud Native Bergen 2099',
      startDate: '2099-10-27T09:00:00Z',
      endDate: '2099-10-27T17:00:00Z',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      url: 'https://cloudnativebergen.dev',
      organizer: {
        '@type': 'Organization',
        name: 'Cloud Native Bergen',
        url: 'https://cloudnativebergen.dev',
        sameAs: [
          'https://twitter.com/cloudnativeberg',
          'https://www.linkedin.com/company/cloud-native-bergen',
        ],
      },
      location: {
        '@type': 'Place',
        name: 'Grieghallen',
        address: {
          '@type': 'PostalAddress',
          streetAddress: 'Edvard Griegs plass 1',
          addressLocality: 'Bergen',
          addressCountry: 'NO',
        },
      },
      offers: {
        '@type': 'Offer',
        url: 'https://checkin.no/event/12345',
        availability: 'https://schema.org/InStock',
      },
    })

    // Home page keeps it simple: no performer without explicit performers.
    expect(jsonLd).not.toHaveProperty('performer')
    // Every value is defined — no `undefined` leaks (invalid JSON-LD).
    expect(JSON.stringify(jsonLd)).not.toContain('undefined')
  })

  it('uses http and localhost host for local domains', () => {
    const jsonLd = buildEventJsonLd({
      conference: makeConference(),
      domain: 'localhost:3000',
    })
    expect(jsonLd.url).toBe('http://localhost:3000')
  })

  it('includes the lowest ticket price incl. VAT on the offer when provided', () => {
    const jsonLd = buildEventJsonLd({
      conference: makeConference(),
      domain: 'cloudnativebergen.dev',
      lowestTicketPrice: { amountInclVat: 1500, formatted: '1 500' } as never,
    })
    expect(jsonLd.offers).toMatchObject({ price: 1500, priceCurrency: 'NOK' })
  })

  it('omits priceCurrency when no price is provided (avoids incomplete Offer)', () => {
    const jsonLd = buildEventJsonLd({
      conference: makeConference(),
      domain: 'cloudnativebergen.dev',
    })
    expect(jsonLd.offers).not.toHaveProperty('price')
    expect(jsonLd.offers).not.toHaveProperty('priceCurrency')
    // A bare Offer (url + availability) is still valid structured data.
    expect(jsonLd.offers).toMatchObject({
      '@type': 'Offer',
      availability: 'https://schema.org/InStock',
    })
  })

  it('omits location entirely when venue and city are unknown', () => {
    const jsonLd = buildEventJsonLd({
      conference: makeConference({
        venueName: undefined,
        venueAddress: undefined,
        city: undefined as unknown as string,
        country: undefined as unknown as string,
      }),
      domain: 'cloudnativebergen.dev',
    })

    expect(jsonLd).not.toHaveProperty('location')
    // Still a valid object with the required Event fields present.
    expect(jsonLd).toMatchObject({
      '@type': 'Event',
      name: 'Cloud Native Bergen 2099',
      startDate: '2099-10-27T09:00:00Z',
    })
    expect(JSON.stringify(jsonLd)).not.toContain('undefined')
  })

  it('emits location with only the venue name when address fields are missing', () => {
    const jsonLd = buildEventJsonLd({
      conference: makeConference({
        venueAddress: undefined,
        city: undefined as unknown as string,
        country: undefined as unknown as string,
      }),
      domain: 'cloudnativebergen.dev',
    })

    expect(jsonLd.location).toEqual({
      '@type': 'Place',
      name: 'Grieghallen',
      address: { '@type': 'PostalAddress' },
    })
  })

  it('omits offers when registration is disabled', () => {
    const jsonLd = buildEventJsonLd({
      conference: makeConference({ registrationEnabled: false }),
      domain: 'cloudnativebergen.dev',
    })
    expect(jsonLd).not.toHaveProperty('offers')
  })

  it('omits the organizer sameAs when there are no social links', () => {
    const jsonLd = buildEventJsonLd({
      conference: makeConference({ socialLinks: [] }),
      domain: 'cloudnativebergen.dev',
    })
    expect(jsonLd.organizer).not.toHaveProperty('sameAs')
  })

  it('adds performer Person entries when performers are supplied', () => {
    const performers: EventPerformer[] = [
      { name: 'Ada Lovelace', image: 'https://cdn.example/ada.jpg' },
      { name: 'Alan Turing' },
    ]
    const jsonLd = buildEventJsonLd({
      conference: makeConference(),
      domain: 'cloudnativebergen.dev',
      performers,
    })

    expect(jsonLd.performer).toEqual([
      {
        '@type': 'Person',
        name: 'Ada Lovelace',
        image: 'https://cdn.example/ada.jpg',
      },
      { '@type': 'Person', name: 'Alan Turing' },
    ])
  })
})

describe('performersFromSchedules', () => {
  function schedule(
    talks: Array<{
      status?: Status
      speakers?: Array<{ _id?: string; name?: string; image?: string }>
    }>,
  ): ConferenceSchedule {
    return {
      _id: 'sched-1',
      date: '2099-10-27',
      tracks: [
        {
          trackTitle: 'Track A',
          trackDescription: '',
          talks: talks.map((t) => ({
            startTime: '09:00',
            endTime: '09:30',
            talk: {
              status: t.status ?? Status.confirmed,
              speakers: t.speakers,
            },
          })),
        },
      ],
    } as unknown as ConferenceSchedule
  }

  it('returns confirmed speakers, de-duplicated by id', () => {
    const performers = performersFromSchedules([
      schedule([
        {
          speakers: [
            { _id: 's1', name: 'Ada Lovelace', image: 'https://x/ada.jpg' },
          ],
        },
        { speakers: [{ _id: 's1', name: 'Ada Lovelace' }] },
        { speakers: [{ _id: 's2', name: 'Alan Turing' }] },
      ]),
    ])

    expect(performers).toEqual([
      { name: 'Ada Lovelace', image: 'https://x/ada.jpg' },
      { name: 'Alan Turing' },
    ])
  })

  it('skips talks that are not confirmed', () => {
    const performers = performersFromSchedules([
      schedule([
        { status: Status.accepted, speakers: [{ _id: 's1', name: 'Ada' }] },
        { status: Status.confirmed, speakers: [{ _id: 's2', name: 'Alan' }] },
      ]),
    ])
    expect(performers).toEqual([{ name: 'Alan' }])
  })

  it('skips unresolved speaker references (no name)', () => {
    const performers = performersFromSchedules([
      schedule([{ speakers: [{ _id: 's1' }, { _id: 's2', name: 'Grace' }] }]),
    ])
    expect(performers).toEqual([{ name: 'Grace' }])
  })

  it('returns an empty array for undefined schedules', () => {
    expect(performersFromSchedules(undefined)).toEqual([])
  })
})

describe('serializeJsonLd', () => {
  it('escapes < so a value cannot break out of the script element', () => {
    const serialized = serializeJsonLd({
      name: 'Evil </script><script>alert(1)</script>',
    })
    expect(serialized).not.toContain('</script>')
    expect(serialized).toContain('\\u003c/script>')
    // Round-trips back to the original value once parsed.
    expect(JSON.parse(serialized).name).toBe(
      'Evil </script><script>alert(1)</script>',
    )
  })
})
