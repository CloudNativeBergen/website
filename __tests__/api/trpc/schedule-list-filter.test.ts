/**
 * @vitest-environment node
 *
 * `schedule.admin.list` builds its GROQ predicate by string concatenation. The
 * status filter was appended AFTER the closing bracket, so `*[...] && status ==
 * $status` read as an array ANDed with a comparison rather than a filter, and
 * every filtered call returned garbage. These tests assert the query we send to
 * Sanity, which is the boundary where that class of bug is visible.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { clientWrite } from '@/lib/sanity/client'
import { ScheduleStatus } from '@/lib/schedule/types'

vi.mock('@/lib/conference/sanity')
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: vi.fn() },
  clientRead: { fetch: vi.fn() },
  clientReadUncached: { fetch: vi.fn() },
}))
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

const createCaller = () =>
  appRouter.createCaller({
    session: { user: { email: organizer.email }, speaker: organizer },
    speaker: organizer,
    user: { email: organizer.email },
  } as unknown as Parameters<typeof appRouter.createCaller>[0])

const fetchMock = clientWrite.fetch as unknown as ReturnType<typeof vi.fn>
const lastQuery = (): string => fetchMock.mock.calls[0][0] as string

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getConferenceForCurrentDomain).mockResolvedValue({
    conference: conference as never,
    domain: 'test.com',
    error: null,
    status: 'resolved' as const,
  })
  fetchMock.mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('schedule.admin.list query construction', () => {
  it('keeps every predicate inside the filter brackets', async () => {
    await createCaller().schedule.admin.list({
      status: ScheduleStatus.Draft,
    })

    const query = lastQuery()
    expect(query).toMatch(/^\*\[.*\]$/)
    expect(query).toContain('status == $status')
    // The bug: the status test ended up after the closing bracket.
    expect(query).not.toMatch(/\]\s*&&/)
  })

  it('scopes to the conference whether or not a status is given', async () => {
    await createCaller().schedule.admin.list({})
    expect(lastQuery()).toContain('conference._ref == $conferenceId')

    fetchMock.mockClear()
    await createCaller().schedule.admin.list({
      status: ScheduleStatus.Official,
    })
    expect(lastQuery()).toContain('conference._ref == $conferenceId')
  })

  it('omits the status predicate when no status is requested', async () => {
    await createCaller().schedule.admin.list({})

    expect(lastQuery()).not.toContain('status ==')
  })

  it('passes the status through as a bound parameter, not interpolated', async () => {
    await createCaller().schedule.admin.list({
      status: ScheduleStatus.Archived,
    })

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      conferenceId: 'conf-1',
      status: ScheduleStatus.Archived,
    })
  })
})
