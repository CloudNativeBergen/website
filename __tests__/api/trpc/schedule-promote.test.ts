/**
 * @vitest-environment node
 *
 * Publishing is the ONLY write that changes the public program in the drafts
 * architecture — draft saves auto-fork and Live mode is read-only. Two things
 * therefore hang off it, and an adversarial review found both missing:
 *
 *  - speakers must be told when a talk they own moved (before drafts, edits hit
 *    the official day directly and the save path alerted),
 *  - the day being replaced must be archived even when it is a LEGACY document
 *    with no `status` field, or the conference ends up with two official days
 *    for one date and the speaker-facing lookups tie.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { clientWrite } from '@/lib/sanity/client'
import { getTalkStatuses } from '@/lib/schedule/sanity'
import { notifyScheduleChanges } from '@/lib/reminders'
import { Status as ProposalStatus } from '@/lib/proposal/types'

vi.mock('@/lib/conference/sanity')
vi.mock('@/lib/reminders', () => ({ notifyScheduleChanges: vi.fn() }))
vi.mock('@/lib/schedule/sanity', async () => {
  const actual = await vi.importActual<typeof import('@/lib/schedule/sanity')>(
    '@/lib/schedule/sanity',
  )
  return { ...actual, getTalkStatuses: vi.fn() }
})
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: vi.fn(), transaction: vi.fn() },
  clientRead: { fetch: vi.fn() },
  clientReadUncached: { fetch: vi.fn() },
}))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn() }))

const organizer = {
  _id: 'organizer-1',
  name: 'Organizer',
  email: 'org@test.com',
  isOrganizer: true,
  organizerOrgIds: ['org-test'],
}

const conference = {
  _id: 'conf-1',
  title: 'Test Conf',
  organization: { _type: 'reference', _ref: 'org-test' },
}

const slot = (talkId: string, startTime: string) => ({
  talk: { _ref: talkId },
  startTime,
  endTime: '99:99',
})

/** The draft being published: talk-a moved 09:00 -> 14:00. */
const draft = {
  _id: 'draft-1',
  date: '2026-11-05',
  status: 'draft',
  tracks: [{ trackTitle: 'Track A', talks: [slot('talk-a', '14:00')] }],
}

const patches: string[] = []
const commit = vi.fn()

const createCaller = () =>
  appRouter.createCaller({
    session: { user: { email: organizer.email }, speaker: organizer },
    speaker: organizer,
    user: { email: organizer.email },
  } as unknown as Parameters<typeof appRouter.createCaller>[0])

const fetchMock = clientWrite.fetch as unknown as ReturnType<typeof vi.fn>
const notifyMock = notifyScheduleChanges as unknown as ReturnType<typeof vi.fn>

/** `existing` is whatever the outgoing-official lookup should return. */
function wireFetch(existing: unknown) {
  fetchMock.mockImplementation((query: string) => {
    if (query.includes('_id == $id')) return Promise.resolve(draft)
    return Promise.resolve(existing)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  patches.length = 0
  vi.mocked(getConferenceForCurrentDomain).mockResolvedValue({
    conference: conference as never,
    domain: 'test.com',
    error: null,
  })
  vi.mocked(getTalkStatuses).mockResolvedValue({
    'talk-a': ProposalStatus.confirmed,
  })
  notifyMock.mockResolvedValue({ moved: 1, notified: 1 })
  ;(
    clientWrite.transaction as unknown as ReturnType<typeof vi.fn>
  ).mockReturnValue({
    patch: (id: string) => {
      patches.push(id)
      return {
        patch: () => ({}),
        commit,
      }
    },
    commit,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('schedule.action promote — archiving the outgoing day', () => {
  it('finds a LEGACY official day that has no status field', async () => {
    wireFetch({ _id: 'legacy-1', tracks: [] })

    await createCaller().schedule.action({ id: 'draft-1', action: 'promote' })

    const lookup = fetchMock.mock.calls
      .map(([q]) => q as string)
      .find((q) => q.includes('date == $date'))
    // Matching only `status == 'official'` would skip the legacy day and leave
    // the conference with two published days for one date.
    expect(lookup).toContain('!defined(status)')
    expect(patches).toContain('legacy-1')
  })

  it('still publishes when there is no previous day for the date', async () => {
    wireFetch(null)

    await expect(
      createCaller().schedule.action({ id: 'draft-1', action: 'promote' }),
    ).resolves.toMatchObject({ success: true })
  })
})

describe('schedule.action promote — speaker alerts', () => {
  it('diffs the archived day against the published one', async () => {
    wireFetch({
      _id: 'official-1',
      tracks: [{ trackTitle: 'Track A', talks: [slot('talk-a', '09:00')] }],
    })

    await createCaller().schedule.action({ id: 'draft-1', action: 'promote' })

    expect(notifyMock).toHaveBeenCalledOnce()
    const { prior, next, conferenceId, actorId } = notifyMock.mock.calls[0][0]
    expect(prior).toEqual([
      expect.objectContaining({ talkId: 'talk-a', startTime: '09:00' }),
    ])
    expect(next).toEqual([
      expect.objectContaining({ talkId: 'talk-a', startTime: '14:00' }),
    ])
    expect(conferenceId).toBe('conf-1')
    expect(actorId).toBe('organizer-1')
  })

  it('treats a first-ever publish as everything being newly placed', async () => {
    wireFetch(null)

    await createCaller().schedule.action({ id: 'draft-1', action: 'promote' })

    expect(notifyMock.mock.calls[0][0].prior).toEqual([])
  })

  it('does not fail the publish when alerting throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    wireFetch({ _id: 'official-1', tracks: [] })
    notifyMock.mockRejectedValue(new Error('notification backend down'))

    // The program IS published at this point; reporting failure would be a lie.
    await expect(
      createCaller().schedule.action({ id: 'draft-1', action: 'promote' }),
    ).resolves.toMatchObject({ success: true })
  })
})
