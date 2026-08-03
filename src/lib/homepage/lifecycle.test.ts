import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  hasProgrammeContent,
  isLifecycleStatus,
  resolveCfpState,
  resolveHomepageContent,
  resolveHomepageLifecycle,
  resolveHomepageStage,
  resolvePrimaryCta,
  resolveRoadmapSteps,
  resolveTicketState,
} from './lifecycle'
import type { Conference } from '@/lib/conference/types'

/**
 * State derivation is pure logic, so it is tested here rather than through
 * snapshots. `Date.now()` is frozen per test via fake timers so the date-driven
 * stages are deterministic.
 */

const NOW = new Date('2026-06-15T12:00:00.000Z')

function at(now: Date | string = NOW) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(now))
}

afterEach(() => {
  vi.useRealTimers()
})

function makeConference(overrides: Partial<Conference> = {}): Conference {
  return {
    _id: 'conf-1',
    title: 'Test Conf',
    startDate: '2026-09-15',
    endDate: '2026-09-15',
    registrationEnabled: false,
    schedules: [],
    featuredSpeakers: [],
    organizers: [],
    sponsors: [],
    ...overrides,
  } as unknown as Conference
}

/** A schedule day containing one talk with the given status. */
function scheduleWith(status: string | undefined) {
  return [
    {
      _id: 's1',
      date: '2026-09-15',
      tracks: [
        {
          trackTitle: 'Track 1',
          trackDescription: '',
          talks: [
            {
              startTime: '09:00',
              endTime: '09:45',
              ...(status ? { talk: { _id: 't1', status } } : {}),
            },
          ],
        },
      ],
    },
  ] as unknown as Conference['schedules']
}

describe('hasProgrammeContent', () => {
  it('is false when the programme date has not passed', () => {
    at()
    expect(
      hasProgrammeContent(
        makeConference({
          programDate: '2026-08-01',
          schedules: scheduleWith('confirmed'),
        }),
      ),
    ).toBe(false)
  })

  it('is false for a PUBLISHED but EMPTY schedule (the zero-stats bug)', () => {
    at()
    const conference = makeConference({
      programDate: '2026-01-01',
      schedules: [
        { _id: 's1', date: '2026-09-15', tracks: [] },
      ] as unknown as Conference['schedules'],
    })
    expect(hasProgrammeContent(conference)).toBe(false)
  })

  it('is false when the only talks are not confirmed', () => {
    at()
    expect(
      hasProgrammeContent(
        makeConference({
          programDate: '2026-01-01',
          schedules: scheduleWith('accepted'),
        }),
      ),
    ).toBe(false)
  })

  it('is false for service slots that carry no talk reference', () => {
    at()
    expect(
      hasProgrammeContent(
        makeConference({
          programDate: '2026-01-01',
          schedules: scheduleWith(undefined),
        }),
      ),
    ).toBe(false)
  })

  it('is true for a published schedule with a confirmed talk', () => {
    at()
    expect(
      hasProgrammeContent(
        makeConference({
          programDate: '2026-01-01',
          schedules: scheduleWith('confirmed'),
        }),
      ),
    ).toBe(true)
  })
})

describe('resolveCfpState', () => {
  it('is absent without CFP dates', () => {
    at()
    expect(resolveCfpState(makeConference())).toBe('absent')
  })

  it('is upcoming before the window opens', () => {
    at()
    expect(
      resolveCfpState(
        makeConference({
          cfpStartDate: '2026-07-01',
          cfpEndDate: '2026-08-01',
        }),
      ),
    ).toBe('upcoming')
  })

  it('is open inside the window', () => {
    at()
    expect(
      resolveCfpState(
        makeConference({
          cfpStartDate: '2026-06-01',
          cfpEndDate: '2026-07-01',
        }),
      ),
    ).toBe('open')
  })

  it('is closed after the window', () => {
    at()
    expect(
      resolveCfpState(
        makeConference({
          cfpStartDate: '2026-01-01',
          cfpEndDate: '2026-02-01',
        }),
      ),
    ).toBe('closed')
  })
})

describe('resolveTicketState', () => {
  it('is unavailable when registration is switched off', () => {
    at()
    expect(resolveTicketState(makeConference())).toBe('unavailable')
  })

  it('is unavailable when enabled but no registration link exists', () => {
    at()
    expect(
      resolveTicketState(makeConference({ registrationEnabled: true })),
    ).toBe('unavailable')
  })

  it('is on-sale when registration is configured', () => {
    at()
    expect(
      resolveTicketState(
        makeConference({
          registrationEnabled: true,
          registrationLink: 'https://tickets.example.com',
        }),
      ),
    ).toBe('on-sale')
  })

  it('is sold-out only on an explicit signal', () => {
    at()
    const conference = makeConference({
      registrationEnabled: true,
      registrationLink: 'https://tickets.example.com',
    })
    expect(resolveTicketState(conference, 'sold-out')).toBe('sold-out')
  })

  it('is not-yet-on-sale when every sale window is still upcoming', () => {
    at()
    const conference = makeConference({
      registrationEnabled: true,
      registrationLink: 'https://tickets.example.com',
    })
    expect(resolveTicketState(conference, 'upcoming')).toBe('not-yet-on-sale')
  })

  it('never invents sold-out from a missing signal', () => {
    at()
    const conference = makeConference({
      registrationEnabled: true,
      registrationLink: 'https://tickets.example.com',
    })
    expect(resolveTicketState(conference, null)).toBe('on-sale')
    expect(resolveTicketState(conference, undefined)).toBe('on-sale')
    expect(resolveTicketState(conference, 'unknown')).toBe('on-sale')
  })

  it('is closed once the conference is over', () => {
    at()
    expect(
      resolveTicketState(
        makeConference({
          startDate: '2026-01-10',
          endDate: '2026-01-10',
          registrationEnabled: true,
          registrationLink: 'https://tickets.example.com',
        }),
      ),
    ).toBe('closed')
  })
})

describe('resolveHomepageStage', () => {
  it('is announced for a conference with dates and nothing else', () => {
    at()
    expect(resolveHomepageStage(makeConference())).toBe('announced')
  })

  it('is announced while the CFP is still upcoming', () => {
    at()
    expect(
      resolveHomepageStage(
        makeConference({
          cfpStartDate: '2026-07-01',
          cfpEndDate: '2026-08-01',
        }),
      ),
    ).toBe('announced')
  })

  it('is cfp-open inside the CFP window', () => {
    at()
    expect(
      resolveHomepageStage(
        makeConference({
          cfpStartDate: '2026-06-01',
          cfpEndDate: '2026-07-01',
        }),
      ),
    ).toBe('cfp-open')
  })

  it('is curating once the CFP has closed but no programme is published', () => {
    at()
    expect(
      resolveHomepageStage(
        makeConference({
          cfpStartDate: '2026-01-01',
          cfpEndDate: '2026-02-01',
          programDate: '2026-08-01',
        }),
      ),
    ).toBe('curating')
  })

  it('is programme once the programme date has passed', () => {
    at()
    expect(
      resolveHomepageStage(makeConference({ programDate: '2026-06-01' })),
    ).toBe('programme')
  })

  it('is post-event the day after the end date', () => {
    at()
    expect(
      resolveHomepageStage(
        makeConference({ startDate: '2026-06-01', endDate: '2026-06-01' }),
      ),
    ).toBe('post-event')
  })

  it('is still programme on the final day of the event', () => {
    at('2026-09-15T09:00:00.000Z')
    expect(
      resolveHomepageStage(
        makeConference({
          startDate: '2026-09-15',
          endDate: '2026-09-15',
          programDate: '2026-08-01',
        }),
      ),
    ).toBe('programme')
  })

  it('lets an explicit cancelled status win over every derived stage', () => {
    at()
    expect(
      resolveHomepageStage(
        makeConference({
          programDate: '2026-01-01',
          lifecycleStatus: 'cancelled',
        }),
      ),
    ).toBe('cancelled')
  })

  it('lets an explicit archived status win over post-event', () => {
    at()
    expect(
      resolveHomepageStage(
        makeConference({
          startDate: '2020-01-01',
          endDate: '2020-01-01',
          lifecycleStatus: 'archived',
        }),
      ),
    ).toBe('archived')
  })

  it('ignores an unrecognised status value rather than blanking the page', () => {
    at()
    expect(
      resolveHomepageStage(
        makeConference({
          lifecycleStatus: 'postponed' as never,
        }),
      ),
    ).toBe('announced')
  })
})

describe('isLifecycleStatus', () => {
  it('accepts only the two explicit statuses', () => {
    expect(isLifecycleStatus('cancelled')).toBe(true)
    expect(isLifecycleStatus('archived')).toBe(true)
    expect(isLifecycleStatus('post-event')).toBe(false)
    expect(isLifecycleStatus(undefined)).toBe(false)
  })
})

describe('resolveHomepageContent', () => {
  it('reports an empty conference as first edition with nothing to show', () => {
    at()
    const content = resolveHomepageContent(makeConference())
    expect(content).toEqual({
      hasGallery: false,
      hasVanityMetrics: false,
      hasFeaturedSpeakers: false,
      hasOrganizers: false,
      hasSponsors: false,
      hasProgramme: false,
      hasRecordings: false,
      isFirstEdition: true,
    })
  })

  it('stops being a first edition once there are past photos', () => {
    at()
    const content = resolveHomepageContent(
      makeConference({
        featuredGalleryImages: [{ _id: 'g1' }] as never,
      }),
    )
    expect(content.hasGallery).toBe(true)
    expect(content.isFirstEdition).toBe(false)
  })

  it('treats quoted vanity metrics as evidence of history', () => {
    at()
    expect(
      resolveHomepageContent(
        makeConference({
          vanityMetrics: [{ label: 'Attendees', value: '400' }],
        }),
      ).isFirstEdition,
    ).toBe(false)
  })
})

describe('resolvePrimaryCta', () => {
  const empty = {
    hasGallery: false,
    hasVanityMetrics: false,
    hasFeaturedSpeakers: false,
    hasOrganizers: false,
    hasSponsors: false,
    hasProgramme: false,
    hasRecordings: false,
    isFirstEdition: true,
  }

  it('pushes the programme after the event, never tickets', () => {
    expect(
      resolvePrimaryCta('post-event', 'closed', 'closed', {
        ...empty,
        hasProgramme: true,
      }),
    ).toBe('programme')
  })

  it('falls back to practical info after an event with no programme', () => {
    expect(resolvePrimaryCta('post-event', 'closed', 'closed', empty)).toBe(
      'info',
    )
  })

  it('puts the CFP ahead of tickets while it is open', () => {
    expect(resolvePrimaryCta('cfp-open', 'open', 'on-sale', empty)).toBe('cfp')
  })

  it('pushes tickets once the CFP is closed', () => {
    expect(resolvePrimaryCta('curating', 'closed', 'on-sale', empty)).toBe(
      'tickets',
    )
  })

  it('does not push sold-out tickets', () => {
    expect(
      resolvePrimaryCta('programme', 'closed', 'sold-out', {
        ...empty,
        hasProgramme: true,
      }),
    ).toBe('programme')
  })

  it('falls back to practical info on day one', () => {
    expect(resolvePrimaryCta('announced', 'absent', 'unavailable', empty)).toBe(
      'info',
    )
  })
})

describe('resolveHomepageLifecycle', () => {
  it('resolves the day-one state end to end', () => {
    at()
    const lifecycle = resolveHomepageLifecycle(makeConference())
    expect(lifecycle.stage).toBe('announced')
    expect(lifecycle.cfp).toBe('absent')
    expect(lifecycle.tickets).toBe('unavailable')
    expect(lifecycle.content.isFirstEdition).toBe(true)
    expect(lifecycle.primaryCta).toBe('info')
    expect(lifecycle.isOverridden).toBe(false)
  })

  it('marks cancelled and archived as page overrides with no ticket claim', () => {
    at()
    for (const status of ['cancelled', 'archived'] as const) {
      const lifecycle = resolveHomepageLifecycle(
        makeConference({
          lifecycleStatus: status,
          registrationEnabled: true,
          registrationLink: 'https://tickets.example.com',
        }),
      )
      expect(lifecycle.isOverridden).toBe(true)
      expect(lifecycle.tickets).toBe('unavailable')
    }
  })

  it('threads the live availability signal through', () => {
    at()
    const lifecycle = resolveHomepageLifecycle(
      makeConference({
        registrationEnabled: true,
        registrationLink: 'https://tickets.example.com',
      }),
      { ticketAvailability: 'sold-out' },
    )
    expect(lifecycle.tickets).toBe('sold-out')
  })
})

describe('resolveRoadmapSteps', () => {
  const iso = (v: string) => v

  function steps(conference: Conference) {
    return resolveRoadmapSteps(
      conference,
      resolveHomepageLifecycle(conference),
      iso,
    )
  }

  it('is EMPTY for a conference that has only set its event dates', () => {
    at()
    // The day-one floor: no CFP dates, no programme date, no ticketing. The band
    // must render dates + venue + countdown rather than three "TBA" rows.
    expect(steps(makeConference())).toEqual([])
  })

  it('omits the CFP step when no CFP dates exist', () => {
    at()
    const conference = makeConference({ programDate: '2026-08-01' })
    expect(steps(conference).map((s) => s.key)).toEqual(['programme'])
  })

  it('announces an upcoming CFP with its opening date', () => {
    at()
    const conference = makeConference({
      cfpStartDate: '2026-07-01',
      cfpEndDate: '2026-08-01',
    })
    expect(steps(conference)[0]).toMatchObject({
      key: 'cfp',
      status: 'upcoming',
      detail: 'Opens 2026-07-01',
    })
    expect(steps(conference)[0].href).toBeUndefined()
  })

  it('links an open CFP', () => {
    at()
    const conference = makeConference({
      cfpStartDate: '2026-06-01',
      cfpEndDate: '2026-07-01',
    })
    expect(steps(conference)[0]).toMatchObject({
      key: 'cfp',
      status: 'open',
      href: '/cfp',
    })
  })

  it('does NOT link a programme that is published but empty', () => {
    at()
    const conference = makeConference({
      programDate: '2026-01-01',
      schedules: [
        { _id: 's1', date: '2026-09-15', tracks: [] },
      ] as unknown as Conference['schedules'],
    })
    const programme = steps(conference).find((s) => s.key === 'programme')
    expect(programme).toMatchObject({ status: 'upcoming' })
    expect(programme?.href).toBeUndefined()
  })

  it('links a programme that has content', () => {
    at()
    const conference = makeConference({
      programDate: '2026-01-01',
      schedules: scheduleWith('confirmed'),
    })
    expect(steps(conference).find((s) => s.key === 'programme')).toMatchObject({
      status: 'open',
      detail: 'Published',
      href: '/program',
    })
  })

  it('omits the ticket step when nothing is known about sales', () => {
    at()
    expect(steps(makeConference()).some((s) => s.key === 'tickets')).toBe(false)
  })

  it('renders a sold-out ticket step without a link', () => {
    at()
    const conference = makeConference({
      registrationEnabled: true,
      registrationLink: 'https://tickets.example.com',
    })
    const result = resolveRoadmapSteps(
      conference,
      resolveHomepageLifecycle(conference, { ticketAvailability: 'sold-out' }),
      iso,
    )
    expect(result.find((s) => s.key === 'tickets')).toMatchObject({
      status: 'done',
      detail: 'Sold out',
    })
    expect(result.find((s) => s.key === 'tickets')?.href).toBeUndefined()
  })
})
