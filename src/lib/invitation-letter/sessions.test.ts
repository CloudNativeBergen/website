import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Status } from '@/lib/proposal/types'
import type { ProposalExisting } from '@/lib/proposal/types'

const getProposals = vi.fn()
vi.mock('@/lib/proposal/data/sanity', () => ({
  getProposals: (...args: unknown[]) => getProposals(...args),
}))

const { confirmedSessionsForSpeaker } = await import('./sessions')

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

    expect(sessions.map((session) => session.title)).toEqual([
      'Running Kubernetes on a Shoestring',
      'Cutting the Cloud Bill in Half',
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
