import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Status } from '@/lib/proposal/types'
import type { ProposalExisting } from '@/lib/proposal/types'

const getProposals = vi.fn()
vi.mock('@/lib/proposal/data/sanity', () => ({
  getProposals: (...args: unknown[]) => getProposals(...args),
}))

const { confirmedSessionsForSpeaker, hasConfirmedTalkAtConference } =
  await import('./sessions')

/** Just enough of a proposal for the mapper. */
function proposal(overrides: Partial<ProposalExisting> = {}) {
  return {
    _id: 'talk-1',
    title: 'Running Kubernetes on a Shoestring',
    status: Status.confirmed,
    scheduleInfo: {
      date: '2026-10-26',
      trackTitle: 'Track 2',
      timeSlot: { startTime: '14:00', endTime: '14:45' },
    },
    ...overrides,
  } as unknown as ProposalExisting
}

function resolves(proposals: ProposalExisting[]) {
  getProposals.mockResolvedValue({ proposals, proposalsError: null })
}

beforeEach(() => {
  getProposals.mockReset()
  resolves([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('confirmedSessionsForSpeaker', () => {
  it('asks for confirmed talks only, in this conference only', async () => {
    await confirmedSessionsForSpeaker('speaker-1', 'conf-1')

    expect(getProposals).toHaveBeenCalledWith({
      speakerId: 'speaker-1',
      conferenceId: 'conf-1',
      statuses: [Status.confirmed],
      includeSchedule: true,
    })
  })

  it('carries the title, date, time and track through', async () => {
    resolves([proposal()])

    expect(await confirmedSessionsForSpeaker('speaker-1', 'conf-1')).toEqual([
      {
        title: 'Running Kubernetes on a Shoestring',
        date: '2026-10-26',
        startTime: '14:00',
        endTime: '14:45',
        track: 'Track 2',
      },
    ])
  })

  it('returns a confirmed talk that has no schedule slot yet', async () => {
    resolves([proposal({ scheduleInfo: undefined })])

    expect(await confirmedSessionsForSpeaker('speaker-1', 'conf-1')).toEqual([
      {
        title: 'Running Kubernetes on a Shoestring',
        date: undefined,
        startTime: undefined,
        endTime: undefined,
        track: undefined,
      },
    ])
  })

  it('returns every confirmed talk when a speaker has more than one', async () => {
    resolves([
      proposal(),
      proposal({ _id: 'talk-2', title: 'Cutting the Cloud Bill in Half' }),
    ])

    const sessions = await confirmedSessionsForSpeaker('speaker-1', 'conf-1')

    expect(sessions).toHaveLength(2)
  })

  // `getProposals` orders by `_updatedAt desc`, i.e. last-edited-first, so the
  // read really can hand us day 2 before day 1. The mock therefore returns them
  // BACKWARDS on purpose — otherwise this test would pass without a sort.
  it('prints sessions chronologically, not in edit order', async () => {
    resolves([
      proposal({
        _id: 'talk-late',
        title: 'Day Two Afternoon',
        scheduleInfo: {
          date: '2026-10-27',
          trackTitle: 'Track 1',
          timeSlot: { startTime: '15:00', endTime: '15:45' },
        },
      }),
      proposal({
        _id: 'talk-mid',
        title: 'Day One Afternoon',
        scheduleInfo: {
          date: '2026-10-26',
          trackTitle: 'Track 1',
          timeSlot: { startTime: '15:00', endTime: '15:45' },
        },
      }),
      proposal({
        _id: 'talk-early',
        title: 'Day One Morning',
        scheduleInfo: {
          date: '2026-10-26',
          trackTitle: 'Track 1',
          timeSlot: { startTime: '09:00', endTime: '09:45' },
        },
      }),
    ])

    expect(
      (await confirmedSessionsForSpeaker('speaker-1', 'conf-1')).map(
        (session) => session.title,
      ),
    ).toEqual(['Day One Morning', 'Day One Afternoon', 'Day Two Afternoon'])
  })

  it('puts an unscheduled talk last rather than first', async () => {
    resolves([
      proposal({
        _id: 'talk-none',
        title: 'Unscheduled',
        scheduleInfo: undefined,
      }),
      proposal({ _id: 'talk-set', title: 'Scheduled' }),
    ])

    expect(
      (await confirmedSessionsForSpeaker('speaker-1', 'conf-1')).map(
        (session) => session.title,
      ),
    ).toEqual(['Scheduled', 'Unscheduled'])
  })

  // What the real projection returns for a confirmed-but-unscheduled talk: the
  // sub-query resolves against a NULL schedule, so the keys exist and are null.
  // The previous fixture used `undefined`, which the query never produces.
  it('normalises the nulls GROQ actually returns for an unscheduled talk', async () => {
    resolves([
      proposal({
        scheduleInfo: {
          date: null,
          trackTitle: null,
          timeSlot: null,
        } as unknown as ProposalExisting['scheduleInfo'],
      }),
    ])

    expect(await confirmedSessionsForSpeaker('speaker-1', 'conf-1')).toEqual([
      {
        title: 'Running Kubernetes on a Shoestring',
        date: undefined,
        startTime: undefined,
        endTime: undefined,
        track: undefined,
      },
    ])
  })

  // The letter states that the applicant WILL present. A speaker with an
  // `accepted` talk has not said yes yet and may not travel at all, so this is
  // the assertion that keeps the letter from making a false claim to a consulate.
  it('drops an accepted-but-unconfirmed talk even if the read returns one', async () => {
    resolves([
      proposal({ _id: 'talk-2', title: 'Confirmed Talk' }),
      proposal({
        _id: 'talk-3',
        title: 'Merely Accepted Talk',
        status: Status.accepted,
      }),
    ])

    const sessions = await confirmedSessionsForSpeaker('speaker-1', 'conf-1')

    expect(sessions.map((session) => session.title)).toEqual(['Confirmed Talk'])
  })

  it.each([Status.accepted, Status.submitted, Status.waitlisted, Status.draft])(
    'drops a %s talk',
    async (status) => {
      resolves([proposal({ status })])

      expect(await confirmedSessionsForSpeaker('speaker-1', 'conf-1')).toEqual(
        [],
      )
    },
  )

  // GUARD BEFORE FETCH. `getProposals` composes its filter from the arguments
  // it is given: called without a conference it would return this speaker's
  // talks from EVERY edition, and the letter would cite a talk from another
  // year as the reason to travel. So the read must never happen at all.
  it('never reads when the conference is unknown', async () => {
    expect(await confirmedSessionsForSpeaker('speaker-1', undefined)).toEqual(
      [],
    )
    expect(await confirmedSessionsForSpeaker('speaker-1', '')).toEqual([])
    expect(await confirmedSessionsForSpeaker('speaker-1', '   ')).toEqual([])
    expect(getProposals).not.toHaveBeenCalled()
  })

  it('never reads when no speaker was identified', async () => {
    expect(await confirmedSessionsForSpeaker(undefined, 'conf-1')).toEqual([])
    expect(await confirmedSessionsForSpeaker('', 'conf-1')).toEqual([])
    expect(getProposals).not.toHaveBeenCalled()
  })

  it('yields no sessions rather than failing the letter on a read error', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    getProposals.mockResolvedValue({
      proposals: [],
      proposalsError: new Error('Sanity is down'),
    })

    expect(await confirmedSessionsForSpeaker('speaker-1', 'conf-1')).toEqual([])
    expect(logged).toHaveBeenCalled()
  })

  it('survives a read that returns nothing at all', async () => {
    getProposals.mockResolvedValue({
      proposals: undefined,
      proposalsError: null,
    })

    expect(await confirmedSessionsForSpeaker('speaker-1', 'conf-1')).toEqual([])
  })
})

describe('hasConfirmedTalkAtConference', () => {
  const talk = (status: Status, conferenceId: string) =>
    ({
      _id: `talk-${status}-${conferenceId}`,
      title: 'T',
      status,
      conference: { _id: conferenceId },
    }) as unknown as ProposalExisting

  it('offers the shortcut for a talk confirmed at THIS conference', () => {
    expect(
      hasConfirmedTalkAtConference(
        [talk(Status.confirmed, 'conf-2026')],
        'conf-2026',
      ),
    ).toBe(true)
  })

  // The speaker admin loads proposals across every edition in the org, so this
  // is the case a bare `status === confirmed` check gets wrong: the shortcut
  // would seed `role=speaker` and the letter would assert the applicant is a
  // confirmed speaker at an event they are not speaking at.
  it('refuses a talk confirmed at a PREVIOUS edition', () => {
    expect(
      hasConfirmedTalkAtConference(
        [talk(Status.confirmed, 'conf-2025')],
        'conf-2026',
      ),
    ).toBe(false)
  })

  it('picks the right edition out of a mixed history', () => {
    const proposals = [
      talk(Status.confirmed, 'conf-2024'),
      talk(Status.accepted, 'conf-2026'),
      talk(Status.confirmed, 'conf-2025'),
    ]

    expect(hasConfirmedTalkAtConference(proposals, 'conf-2026')).toBe(false)

    expect(
      hasConfirmedTalkAtConference(
        [...proposals, talk(Status.confirmed, 'conf-2026')],
        'conf-2026',
      ),
    ).toBe(true)
  })

  it.each([Status.accepted, Status.submitted, Status.waitlisted, Status.draft])(
    'refuses a %s talk at this conference',
    (status) => {
      expect(
        hasConfirmedTalkAtConference([talk(status, 'conf-2026')], 'conf-2026'),
      ).toBe(false)
    },
  )

  it('reads a conference left as an unexpanded reference', () => {
    const proposal = {
      _id: 'talk-ref',
      title: 'T',
      status: Status.confirmed,
      conference: { _ref: 'conf-2026', _type: 'reference' },
    } as unknown as ProposalExisting

    expect(hasConfirmedTalkAtConference([proposal], 'conf-2026')).toBe(true)
    expect(hasConfirmedTalkAtConference([proposal], 'conf-2025')).toBe(false)
  })

  it('refuses when the current conference is unknown', () => {
    const proposals = [talk(Status.confirmed, 'conf-2026')]

    expect(hasConfirmedTalkAtConference(proposals, undefined)).toBe(false)
    expect(hasConfirmedTalkAtConference(proposals, '  ')).toBe(false)
  })

  it('refuses when the speaker has no proposals at all', () => {
    expect(hasConfirmedTalkAtConference(undefined, 'conf-2026')).toBe(false)
    expect(hasConfirmedTalkAtConference([], 'conf-2026')).toBe(false)
  })
})
