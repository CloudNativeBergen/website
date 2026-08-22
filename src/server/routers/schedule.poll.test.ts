/**
 * THE SCHEDULE EDITOR'S POLL — cost contract and tenant scoping.
 *
 * This is the highest-volume single read in the product: it runs for as long as
 * an organizer has the schedule editor open. Two properties are invisible to
 * every other test, and both were wrong in production:
 *
 *  1. HOW MANY reads a tick costs. It used to be TWO procedures on one HTTP
 *     call — batched for the browser, billed separately by Sanity.
 *  2. WHICH CLIENT runs them. `clientReadCached` and `clientWrite` have the same
 *     signature and return the same rows, so swapping one for the other changes
 *     no output and no other assertion — it only moves the traffic onto the
 *     write token's live-API quota, which is the expensive one and the one near
 *     its limit. That is why each client here gets its OWN spy, and why every
 *     case asserts both that the CDN client ran AND that the other two did not:
 *     a one-sided assertion would still pass if the read fanned out to both.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

const CONFERENCE_ID = 'conf-bergen'
const ORG_ID = 'org-test'

const SCHEDULE_ROWS = [
  { _id: 'sched-1', _rev: 'rev-1', version: 3 },
  { _id: 'sched-2', _rev: 'rev-9', version: 1 },
]
const STATUS_ROWS = [
  { _id: 'talk-1', status: 'confirmed' },
  { _id: 'talk-2', status: 'accepted' },
]

/** What the probe query resolves to; individual cases move these. */
const probe = {
  proposalCount: 2 as number,
  proposalsLastUpdatedAt: '2026-08-22T10:00:00Z' as string | null,
}

/**
 * Both queries resolve to a plausible shape on EVERY client, so a case fails
 * because the wrong client ran — never because a stub returned nothing and the
 * procedure bailed early. If a mis-routed read returned `undefined` it would be
 * indistinguishable from a crashed one.
 */
function respond(query: unknown) {
  return String(query).includes('"schedules"')
    ? { schedules: SCHEDULE_ROWS, ...probe }
    : STATUS_ROWS
}

// Rest parameters so the recorded calls keep the query, the params AND the
// fetch options — the scoping assertions read `calls[0][1]`.
const cdnFetch = vi.fn(async (...args: unknown[]) => respond(args[0]))
const liveFetch = vi.fn(async (...args: unknown[]) => respond(args[0]))
const writeFetch = vi.fn(async (...args: unknown[]) => respond(args[0]))

vi.mock('@/lib/sanity/client', () => ({
  clientReadCached: { fetch: (...a: unknown[]) => cdnFetch(...a) },
  clientReadUncached: { fetch: (...a: unknown[]) => liveFetch(...a) },
  clientWrite: {
    fetch: (...a: unknown[]) => writeFetch(...a),
    create: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
  sanityImage: () => ({ url: () => '' }),
  speakerImageUrl: () => '',
  galleryImageSrc: () => '',
  isInlineImageDataUri: () => false,
}))

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

import { scheduleRouter } from './schedule'

/** An organizer of the org the request domain resolves to. */
function makeCaller(organizerOrgIds: string[] = [ORG_ID]) {
  const speaker = {
    _id: 'sp-1',
    name: 'Org',
    isOrganizer: true,
    organizerOrgIds,
  }
  const ctx = {
    session: { speaker, user: { name: 'Org' } },
    speaker,
  } as unknown as Context
  return scheduleRouter.createCaller(ctx)
}

const noReadRan = () => {
  expect(cdnFetch).not.toHaveBeenCalled()
  expect(liveFetch).not.toHaveBeenCalled()
  expect(writeFetch).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  probe.proposalCount = 2
  probe.proposalsLastUpdatedAt = '2026-08-22T10:00:00Z'
  getConferenceMock.mockResolvedValue({
    conference: {
      _id: CONFERENCE_ID,
      organization: { _type: 'reference', _ref: ORG_ID },
    },
    error: null,
  })
})

describe('pollExternalChanges — one read, on the cheap quota', () => {
  it('costs exactly ONE Sanity read per tick', async () => {
    await makeCaller().admin.pollExternalChanges()

    expect(cdnFetch).toHaveBeenCalledTimes(1)
  })

  it('runs on the CDN client and NOT on the write client', async () => {
    await makeCaller().admin.pollExternalChanges()

    expect(cdnFetch).toHaveBeenCalledTimes(1)
    expect(writeFetch).not.toHaveBeenCalled()
    expect(liveFetch).not.toHaveBeenCalled()
  })

  it('asks APICDN for a non-stale answer and keeps Next’s data cache out', async () => {
    // The one property the write client was chosen for was cache-bypass. It is
    // bought here without the write token: `no-store` for Next, `noStale` for
    // Sanity's CDN.
    await makeCaller().admin.pollExternalChanges()

    expect(cdnFetch.mock.calls[0][2]).toEqual({
      cacheMode: 'noStale',
      cache: 'no-store',
    })
  })

  it('scopes every root filter to the request conference, by GROQ parameter', async () => {
    await makeCaller().admin.pollExternalChanges()

    const [query, params] = cdnFetch.mock.calls[0]
    expect(params).toEqual({ conferenceId: CONFERENCE_ID })
    // Three roots in the composed query — schedules, the talk count and the
    // newest talk write — and each one carries the tenant predicate.
    expect(
      String(query).split('conference._ref == $conferenceId'),
    ).toHaveLength(4)
    // The tenant is the DOMAIN's conference, never anything the caller sent.
    expect(getConferenceMock).toHaveBeenCalled()
  })

  it('returns the schedule revisions the conflict banner compares against', async () => {
    const result = await makeCaller().admin.pollExternalChanges()

    expect(result.schedules).toEqual(SCHEDULE_ROWS)
  })
})

describe('pollExternalChanges — a fingerprint instead of the whole talk set', () => {
  it('never transfers per-talk rows', async () => {
    const result = await makeCaller().admin.pollExternalChanges()

    expect(Object.keys(result).sort()).toEqual([
      'proposalsFingerprint',
      'schedules',
    ])
    // Nothing in the polled query projects a talk status: the poll DETECTS a
    // change, `proposalsStatus` reads it.
    expect(String(cdnFetch.mock.calls[0][0])).not.toContain('status')
  })

  it('summarises the talk set as count + newest write', async () => {
    const result = await makeCaller().admin.pollExternalChanges()

    expect(result.proposalsFingerprint).toBe('2:2026-08-22T10:00:00Z')
  })

  it('moves when a talk is EDITED (same count, newer write)', async () => {
    const before = (await makeCaller().admin.pollExternalChanges())
      .proposalsFingerprint

    probe.proposalsLastUpdatedAt = '2026-08-22T11:30:00Z'
    const after = (await makeCaller().admin.pollExternalChanges())
      .proposalsFingerprint

    expect(after).not.toBe(before)
  })

  it('moves when a talk is ADDED or REMOVED (same write time, new count)', async () => {
    const before = (await makeCaller().admin.pollExternalChanges())
      .proposalsFingerprint

    probe.proposalCount = 3
    const after = (await makeCaller().admin.pollExternalChanges())
      .proposalsFingerprint

    expect(after).not.toBe(before)
  })

  it('holds still while nothing changes — the case that must not refetch', async () => {
    const first = (await makeCaller().admin.pollExternalChanges())
      .proposalsFingerprint
    const second = (await makeCaller().admin.pollExternalChanges())
      .proposalsFingerprint

    expect(second).toBe(first)
  })

  it('survives an empty conference without inventing a moving fingerprint', async () => {
    probe.proposalCount = 0
    probe.proposalsLastUpdatedAt = null

    const first = (await makeCaller().admin.pollExternalChanges())
      .proposalsFingerprint
    const second = (await makeCaller().admin.pollExternalChanges())
      .proposalsFingerprint

    expect(first).toBe('0:none')
    expect(second).toBe(first)
  })
})

describe('proposalsStatus — the on-change detail read', () => {
  it('runs on the CDN client and NOT on the write client', async () => {
    const rows = await makeCaller().admin.proposalsStatus({
      fingerprint: '2:2026-08-22T10:00:00Z',
    })

    expect(rows).toEqual(STATUS_ROWS)
    expect(cdnFetch).toHaveBeenCalledTimes(1)
    expect(writeFetch).not.toHaveBeenCalled()
    expect(liveFetch).not.toHaveBeenCalled()
  })

  it('scopes the read to the request conference by GROQ parameter', async () => {
    await makeCaller().admin.proposalsStatus({ fingerprint: 'anything' })

    const [query, params] = cdnFetch.mock.calls[0]
    expect(params).toEqual({ conferenceId: CONFERENCE_ID })
    expect(String(query)).toContain('conference._ref == $conferenceId')
  })

  it('never lets the caller’s fingerprint reach the query or its parameters', async () => {
    // The fingerprint is a react-query CACHE KEY, nothing more. If it ever
    // became a filter it would be client-supplied input on a tenant read.
    await makeCaller().admin.proposalsStatus({
      fingerprint: '"] || _type == "speaker"',
    })

    const [query, params] = cdnFetch.mock.calls[0]
    expect(String(query)).not.toContain('speaker')
    expect(params).toEqual({ conferenceId: CONFERENCE_ID })
  })
})

describe('authorization is unchanged — and is checked BEFORE any read', () => {
  it('refuses a caller who is not an organizer of the request org, without reading', async () => {
    await expect(
      makeCaller([]).admin.pollExternalChanges(),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    noReadRan()
  })

  it('refuses the same caller on proposalsStatus, without reading', async () => {
    await expect(
      makeCaller([]).admin.proposalsStatus({ fingerprint: 'x' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    noReadRan()
  })

  it('reads nothing at all when the domain conference cannot be resolved', async () => {
    // Fails CLOSED. The waist refuses first here (an unresolvable org denies
    // every organizer), so this case is not evidence about the handler's own
    // conference check — only that an unresolvable tenant never reaches Sanity.
    getConferenceMock.mockResolvedValue({ conference: null, error: null })

    await expect(makeCaller().admin.pollExternalChanges()).rejects.toThrow()

    noReadRan()
  })
})
