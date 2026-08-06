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
  await getSpeakerAdminDetail('sp-1')
  return fetchMock.mock.calls[0][0] as string
}

beforeEach(() => vi.clearAllMocks())

describe('getSpeakerAdminDetail projects explicitly (#863)', () => {
  it('does not spread the document', async () => {
    expect(await capturedQuery()).not.toContain('...')
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
    const query = await capturedQuery()
    for (const field of DROPPED_FIELDS) {
      expect(query).not.toContain(field)
    }
  })

  it('is still a by-id read, so the caller must guard it', async () => {
    // Deliberately NOT scoped in GROQ. Speaker ownership is membership ∪
    // participation and has one authoritative implementation
    // (`requireSpeakerInCurrentOrg`); a second copy of it as a predicate here is
    // a copy that can drift, and the copy that drifts fails open.
    const query = await capturedQuery()
    expect(query).toContain('_id == $speakerId')
    expect(query).not.toContain('$orgId')
  })
})
