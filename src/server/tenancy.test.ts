/**
 * @vitest-environment node
 *
 * The shared OWNERSHIP GUARDS (#730) that every admin mutation taking a document
 * id from client input now calls. These are the single point where a
 * cross-tenant write is refused, so each refusal reason is pinned here:
 * unresolvable request tenant, missing document, wrong `_type`, unowned
 * document, foreign owner, and a failing probe read.
 *
 * The router-level proof that the guards are actually WIRED IN lives in
 * `src/server/routers/tenancy.writes.test.ts`.
 */

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
  clientReadCached: { fetch: h.fetch },
  clientWrite: { fetch: h.fetch },
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getDocumentTenant,
  requireCurrentOrgId,
  requireDocumentInCurrentConference,
  requireDocumentInCurrentOrg,
  requireDocumentsInCurrentConference,
  requireDocumentsInCurrentOrg,
  requireSpeakerInCurrentOrg,
  requireSpeakersInCurrentOrg,
} from './tenancy'

const ORG_A = 'org-A'
const ORG_B = 'org-B'
const CONF_A = 'conf-A'

/** The request host resolves to CONF_A / ORG_A, or to nothing. */
function host(resolvable: boolean) {
  h.getConference.mockResolvedValue({
    conference: resolvable
      ? { _id: CONF_A, organization: { _ref: ORG_A } }
      : {},
    domain: 'localhost',
    error: resolvable ? null : new Error('Conference not found for domain'),
  })
}

/** Does this query ask which orgs own a conference the speaker has a talk at? */
function isParticipationQuery(query: string) {
  return query.includes('.conference->organization._ref')
}

/**
 * What the ownership probe reports for the id under test.
 *
 * `participationOrgIds` is the SECOND dimension the speaker rule reads: the orgs
 * whose conferences host a talk by this person. It feeds both the ownership
 * fallback and — since #731 — the exclusivity check.
 */
function probe(
  doc: Record<string, unknown> | null,
  participationOrgIds: string[] = [],
) {
  h.fetch.mockImplementation(async (query: string) => {
    if (query.includes('"memberOrgIds"')) return doc
    if (isParticipationQuery(query)) return participationOrgIds
    return 0
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  host(true)
})

describe('requireCurrentOrgId', () => {
  it('returns the request org', async () => {
    await expect(requireCurrentOrgId()).resolves.toBe(ORG_A)
  })

  it('refuses an unresolvable host rather than returning null', async () => {
    host(false)
    await expect(requireCurrentOrgId()).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('getDocumentTenant', () => {
  it('projects every tenancy dimension', async () => {
    probe({
      _type: 'topic',
      orgId: ORG_A,
      conferenceId: CONF_A,
      conferenceOrgId: null,
      memberOrgIds: ['x'],
    })
    await expect(getDocumentTenant('doc-1')).resolves.toEqual({
      type: 'topic',
      orgId: ORG_A,
      conferenceId: CONF_A,
      conferenceOrgId: null,
      memberOrgIds: ['x'],
    })
  })

  it('returns null for a missing document, without throwing', async () => {
    probe(null)
    await expect(getDocumentTenant('nope')).resolves.toBeNull()
  })

  it('returns null for an empty id, WITHOUT querying', async () => {
    await expect(getDocumentTenant('')).resolves.toBeNull()
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('FAILS CLOSED on a read error — an unknown tenant authorizes nothing', async () => {
    h.fetch.mockRejectedValue(new Error('sanity down'))
    await expect(getDocumentTenant('doc-1')).resolves.toBeNull()
  })

  it('drops null/blank entries from memberOrgIds', async () => {
    probe({ _type: 'speaker', memberOrgIds: [null, '', ORG_A] })
    await expect(getDocumentTenant('sp')).resolves.toMatchObject({
      memberOrgIds: [ORG_A],
    })
  })
})

describe('requireDocumentInCurrentOrg', () => {
  it('accepts a document owned directly by the request org', async () => {
    probe({ _type: 'topic', orgId: ORG_A })
    await expect(requireDocumentInCurrentOrg('t1', 'topic')).resolves.toBe(
      ORG_A,
    )
  })

  it('accepts a document owned through its CONFERENCE', async () => {
    probe({ _type: 'talk', orgId: null, conferenceOrgId: ORG_A })
    await expect(requireDocumentInCurrentOrg('p1', 'talk')).resolves.toBe(ORG_A)
  })

  it('refuses another org’s document', async () => {
    probe({ _type: 'topic', orgId: ORG_B })
    await expect(
      requireDocumentInCurrentOrg('t1', 'topic'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses the RIGHT org but the WRONG type — a conference is not a topic', async () => {
    probe({ _type: 'conference', orgId: ORG_A })
    await expect(
      requireDocumentInCurrentOrg('conf-A', 'topic'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses an unowned (tenant-key-less) document', async () => {
    probe({ _type: 'topic', orgId: null, conferenceOrgId: null })
    await expect(
      requireDocumentInCurrentOrg('t1', 'topic'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses a missing document', async () => {
    probe(null)
    await expect(
      requireDocumentInCurrentOrg('nope', 'topic'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses on an unresolvable host WITHOUT probing at all', async () => {
    host(false)
    probe({ _type: 'topic', orgId: ORG_A })
    await expect(
      requireDocumentInCurrentOrg('t1', 'topic'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('never leaks whether the foreign id exists — same code and message either way', async () => {
    probe({ _type: 'topic', orgId: ORG_B })
    const foreign = await requireDocumentInCurrentOrg('t1', 'topic').catch(
      (e) => e,
    )
    probe(null)
    const missing = await requireDocumentInCurrentOrg('t1', 'topic').catch(
      (e) => e,
    )
    expect(foreign.code).toBe(missing.code)
    expect(foreign.message).toBe(missing.message)
  })
})

describe('requireDocumentInCurrentConference', () => {
  it('accepts a document in the request conference', async () => {
    probe({ _type: 'volunteer', conferenceId: CONF_A })
    await expect(
      requireDocumentInCurrentConference('v1', 'volunteer'),
    ).resolves.toBe(CONF_A)
  })

  it('refuses another EDITION’s document even inside the same org', async () => {
    probe({
      _type: 'volunteer',
      conferenceId: 'conf-2025',
      conferenceOrgId: ORG_A,
    })
    await expect(
      requireDocumentInCurrentConference('v1', 'volunteer'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses a conference-less document, and the wrong type', async () => {
    probe({ _type: 'volunteer', conferenceId: null })
    await expect(
      requireDocumentInCurrentConference('v1', 'volunteer'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    probe({ _type: 'talk', conferenceId: CONF_A })
    await expect(
      requireDocumentInCurrentConference('v1', 'volunteer'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses on an unresolvable host', async () => {
    host(false)
    await expect(
      requireDocumentInCurrentConference('v1', 'volunteer'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('requireDocumentsInCurrentConference (bulk)', () => {
  /** `count()` of the supplied ids that are ours. */
  function ownedCount(n: number) {
    h.fetch.mockResolvedValue(n)
  }

  it('accepts a batch that is entirely ours', async () => {
    ownedCount(3)
    await expect(
      requireDocumentsInCurrentConference(
        ['a', 'b', 'c'],
        'sponsorForConference',
      ),
    ).resolves.toBe(CONF_A)
  })

  it('refuses the WHOLE batch when even one id is foreign', async () => {
    ownedCount(2)
    await expect(
      requireDocumentsInCurrentConference(
        ['a', 'b', 'c'],
        'sponsorForConference',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('counts DISTINCT ids, so duplicates cannot inflate the batch past the count', async () => {
    ownedCount(1)
    await expect(
      requireDocumentsInCurrentConference(['a', 'a'], 'sponsorForConference'),
    ).resolves.toBe(CONF_A)
  })

  it('FAILS CLOSED when the probe read throws', async () => {
    h.fetch.mockRejectedValue(new Error('sanity down'))
    await expect(
      requireDocumentsInCurrentConference(['a'], 'sponsorForConference'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('an empty batch is a no-op, not an unscoped pass', async () => {
    await expect(
      requireDocumentsInCurrentConference([], 'sponsorForConference'),
    ).resolves.toBe(CONF_A)
    expect(h.fetch).not.toHaveBeenCalled()
  })
})

describe('requireSpeakerInCurrentOrg', () => {
  it('accepts an explicit member of the request org', async () => {
    probe({ _type: 'speaker', memberOrgIds: [ORG_A] })
    await expect(requireSpeakerInCurrentOrg('sp')).resolves.toBe(ORG_A)
  })

  it('accepts a non-member who has a TALK at one of the org’s conferences', async () => {
    // The pre-backfill fallback, matching SPEAKER_ORG_FILTER in the admin lists.
    probe({ _type: 'speaker', memberOrgIds: [] }, [ORG_A])
    await expect(requireSpeakerInCurrentOrg('sp')).resolves.toBe(ORG_A)
  })

  it('refuses a speaker with neither membership nor participation', async () => {
    probe({ _type: 'speaker', memberOrgIds: [ORG_B] })
    await expect(requireSpeakerInCurrentOrg('sp')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('refuses a non-speaker document', async () => {
    probe({ _type: 'conference', memberOrgIds: [ORG_A] })
    await expect(requireSpeakerInCurrentOrg('conf-A')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('requireExclusive refuses a person who ALSO belongs to another org', async () => {
    probe({ _type: 'speaker', memberOrgIds: [ORG_A, ORG_B] })
    await expect(
      requireSpeakerInCurrentOrg('sp', { requireExclusive: true }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    // …and permits them without the flag, since this org does have standing.
    await expect(requireSpeakerInCurrentOrg('sp')).resolves.toBe(ORG_A)
  })

  /**
   * #731 F2. Ownership is `membership ∨ participation`; exclusivity used to be
   * `¬membership(other)` only. A speaker with a TALK at another tenant but no
   * membership there — the exact population `ensureSpeakerOrgMembership`'s
   * best-effort failures and the pre-044 dataset produce — therefore passed the
   * destructive-operation guard and could be merged away by this org, silently
   * re-attributing the other tenant's accepted talk.
   */
  it('requireExclusive refuses a person with a TALK at another org, even with no membership there', async () => {
    probe({ _type: 'speaker', memberOrgIds: [ORG_A] }, [ORG_A, ORG_B])
    await expect(
      requireSpeakerInCurrentOrg('sp', { requireExclusive: true }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    // Ownership is unaffected — this org still has standing over them.
    await expect(requireSpeakerInCurrentOrg('sp')).resolves.toBe(ORG_A)
  })

  it('requireExclusive refuses when ANOTHER tenant’s document references them', async () => {
    // `mergeSpeakers` rewrites every inbound reference with no tenant predicate,
    // so exclusivity has to bound the reference graph too — e.g. a `conference`
    // in org B that lists this person as an organizer.
    h.fetch.mockImplementation(async (query: string) => {
      if (query.includes('"memberOrgIds"')) {
        return { _type: 'speaker', memberOrgIds: [ORG_A] }
      }
      if (isParticipationQuery(query)) return [ORG_A]
      return 1 // one foreign referencing document
    })
    await expect(
      requireSpeakerInCurrentOrg('sp', { requireExclusive: true }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('requireExclusive accepts a person exclusive to this org', async () => {
    probe({ _type: 'speaker', memberOrgIds: [ORG_A] }, [ORG_A])
    await expect(
      requireSpeakerInCurrentOrg('sp', { requireExclusive: true }),
    ).resolves.toBe(ORG_A)
  })

  it('FAILS CLOSED when the participation probe throws', async () => {
    h.fetch.mockImplementation(async (query: string) => {
      if (query.includes('"memberOrgIds"')) {
        return { _type: 'speaker', memberOrgIds: [] }
      }
      throw new Error('sanity down')
    })
    await expect(requireSpeakerInCurrentOrg('sp')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('requireExclusive FAILS CLOSED when the participation probe throws', async () => {
    // An unreadable probe cannot CERTIFY exclusivity any more than it can grant
    // ownership — a destructive op must not proceed on an unknown.
    h.fetch.mockImplementation(async (query: string) => {
      if (query.includes('"memberOrgIds"')) {
        return { _type: 'speaker', memberOrgIds: [ORG_A] }
      }
      throw new Error('sanity down')
    })
    await expect(
      requireSpeakerInCurrentOrg('sp', { requireExclusive: true }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('requireExclusive FAILS CLOSED when the reference-graph probe throws', async () => {
    h.fetch.mockImplementation(async (query: string) => {
      if (query.includes('"memberOrgIds"')) {
        return { _type: 'speaker', memberOrgIds: [ORG_A] }
      }
      if (isParticipationQuery(query)) return [ORG_A]
      throw new Error('sanity down')
    })
    await expect(
      requireSpeakerInCurrentOrg('sp', { requireExclusive: true }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

/**
 * REFERENCE-INJECTION GUARDS (#731 F1/F4). The sibling shape to "a client id
 * reaching a patch": a client id written INTO a reference field of a document
 * the caller does own. For speakers it is also the privilege-bootstrap
 * primitive — participation is what the ownership rule reads.
 */
describe('requireSpeakersInCurrentOrg', () => {
  /** `owned` = how many of the supplied ids the scoped count reports as ours. */
  function count(owned: number | Error) {
    h.fetch.mockImplementation(async () => {
      if (owned instanceof Error) throw owned
      return owned
    })
  }

  it('accepts when every id is a speaker this org has standing over', async () => {
    count(2)
    await expect(
      requireSpeakersInCurrentOrg(['sp-1', 'sp-2']),
    ).resolves.toBe(ORG_A)
  })

  it('refuses the WHOLE array when one id is foreign', async () => {
    count(1)
    await expect(
      requireSpeakersInCurrentOrg(['sp-1', 'sp-foreign']),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses a non-existent id', async () => {
    count(0)
    await expect(requireSpeakersInCurrentOrg(['nope'])).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('duplicates cannot inflate the count', async () => {
    // Two copies of one owned id must not satisfy a two-id request.
    count(1)
    await expect(requireSpeakersInCurrentOrg(['sp-1', 'sp-1'])).resolves.toBe(
      ORG_A,
    )
    count(1)
    await expect(
      requireSpeakersInCurrentOrg(['sp-1', 'sp-2']),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses a blank id rather than silently dropping it', async () => {
    count(1)
    await expect(
      requireSpeakersInCurrentOrg(['sp-1', '']),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('an empty array is a no-op', async () => {
    count(0)
    await expect(requireSpeakersInCurrentOrg([])).resolves.toBe(ORG_A)
  })

  it('FAILS CLOSED when the probe throws', async () => {
    count(new Error('sanity down'))
    await expect(requireSpeakersInCurrentOrg(['sp-1'])).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('refuses on an unresolvable host without probing at all', async () => {
    host(false)
    count(1)
    await expect(requireSpeakersInCurrentOrg(['sp-1'])).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(h.fetch).not.toHaveBeenCalled()
  })
})

describe('requireDocumentsInCurrentOrg', () => {
  it('refuses the whole array when one id is not ours', async () => {
    h.fetch.mockResolvedValue(1)
    await expect(
      requireDocumentsInCurrentOrg(['t-1', 't-2'], 'topic'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('accepts when every id is ours', async () => {
    h.fetch.mockResolvedValue(2)
    await expect(
      requireDocumentsInCurrentOrg(['t-1', 't-2'], 'topic'),
    ).resolves.toBe(ORG_A)
  })

  it('FAILS CLOSED when the probe throws', async () => {
    h.fetch.mockRejectedValue(new Error('sanity down'))
    await expect(
      requireDocumentsInCurrentOrg(['t-1'], 'topic'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
