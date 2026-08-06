import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #863 row 3. `speaker.admin.getById` read through `getSpeaker`, whose
 * projection opens with a bare `...` over the speaker document — so the admin
 * detail endpoint returned every field the schema has and every field it ever
 * grows: the login match-set (`knownEmails`), the linked identity providers,
 * and the OTHER tenants this global person belongs to (`organizations`).
 *
 * The guard on the procedure decides WHO may read; this projection decides WHAT
 * is read, and the two are independent controls. TypeScript cannot enforce the
 * second: a field the query forgot and a field the document lacks both arrive
 * `undefined`, so a projection that silently drops something a consumer needs
 * type-checks perfectly. Hence these cases — `FIELDS` below must mirror
 * `SpeakerAdminDetail` exactly.
 */
const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientRead: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientReadCached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: { fetch: (...a: unknown[]) => fetchMock(...a) },
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefForCurrentConference: vi.fn(),
}))
vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

import { getSpeakerAdminDetail } from './sanity'

/** Every member of `SpeakerAdminDetail`, which the query must project. */
const FIELDS = [
  '_id',
  '_createdAt',
  '_updatedAt',
  'name',
  'title',
  'bio',
  'email',
  'links',
  'flags',
  'gender',
  'genderSelfDescribe',
  'country',
  'consent',
  'slug',
  'image',
]

/**
 * Dropped on purpose. `knownEmails` and `providers` describe how this person
 * AUTHENTICATES, `organizations` names the other tenants they belong to, and the
 * rest nothing on an admin surface reads. None of them administer a speaker.
 *
 * `imageURL` is NOT in this list even though it is not projected as a field: it
 * is the fallback SOURCE inside `coalesce(image.asset->url, imageURL)`, which is
 * how every other read resolves a display image.
 */
const DROPPED_FIELDS = [
  'knownEmails',
  'providers',
  'organizations',
  '_rev',
  'messagingEmailDefault',
  'pushSubscriptions',
  'isOrganizer',
  'organizerOrgIds',
]

async function capturedQuery(): Promise<string> {
  fetchMock.mockResolvedValue(null)
  await getSpeakerAdminDetail('sp-1', 'org-A')
  return fetchMock.mock.calls[0][0] as string
}

beforeEach(() => vi.clearAllMocks())

describe('getSpeakerAdminDetail projects explicitly (#863)', () => {
  it('does not spread the document', async () => {
    const query = await capturedQuery()
    expect(query.slice(query.indexOf('[0]{'))).not.toContain('...')
  })

  it('projects every field its type promises', async () => {
    const query = await capturedQuery()
    for (const field of FIELDS) {
      expect(query).toContain(field)
    }
  })

  it('projects the fields the admin editor writes back', async () => {
    // `SpeakerManagementModal` renders and submits these through
    // `speaker.admin.update`. They are sensitive, and the control on them is the
    // ownership guard — dropping them here would break the editor SILENTLY the
    // moment it reads through this endpoint, exactly the trap `bankingDetails`
    // was in #865.
    const query = await capturedQuery()
    for (const field of ['email', 'gender', 'country', 'consent']) {
      expect(query).toContain(field)
    }
  })

  it('drops the identity and cross-tenant fields the census named', async () => {
    // The PROJECTION only. `organizations` also appears in the root filter, as
    // the membership half of the tenant predicate — which is the opposite of
    // returning it.
    const query = await capturedQuery()
    const projection = query.slice(query.indexOf('[0]{'))
    for (const field of DROPPED_FIELDS) {
      expect(projection).not.toContain(field)
    }
  })

  it('carries the org predicate as well as the id', async () => {
    // An `_id` is a dataset-wide key and scopes nothing. The predicate is the
    // SAME `SPEAKER_ORG_FILTER` the admin lists use, so this cannot return a
    // person who is not already on this org's admin surface — a second control
    // beside `requireSpeakerInCurrentOrg`, not a replacement for it.
    const query = await capturedQuery()
    expect(query).toContain('_id == $speakerId')
    expect(query).toContain('$orgId in coalesce(organizations, [])[]._ref')
  })

  it('carries it UNCONDITIONALLY, and reads nothing without an org', async () => {
    // The fail-open shape this must never become is a predicate guarded by its
    // own parameter (`!defined($orgId) || …`), which reads every tenant when the
    // argument is absent — `optionalTenantFilter` in
    // `eslint-rules/no-unscoped-groq.js`.
    expect(await capturedQuery()).not.toContain('defined($orgId)')

    vi.clearAllMocks()
    const result = await getSpeakerAdminDetail('sp-1', '')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.speaker).toBeNull()
  })

  it('answers a speaker outside the org exactly as it answers a missing one', async () => {
    fetchMock.mockResolvedValue(null)

    const result = await getSpeakerAdminDetail('sp-theirs', 'org-A')

    expect(result.speaker).toBeNull()
    expect(result.err).toBeNull()
  })
})
