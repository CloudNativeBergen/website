import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks -----------------------------------------------------------------

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
}))

const getConferenceForCurrentDomainMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceForCurrentDomainMock(...args),
}))

import {
  organizationField,
  organizationReference,
  getOrganizationRefForCurrentConference,
  getOrganizationRefViaParentConference,
} from './sanity'

beforeEach(() => {
  vi.clearAllMocks()
})

// --- organizationField / organizationReference -----------------------------

describe('organizationField', () => {
  it('spreads a reference field for a present org id', () => {
    expect(organizationField('org-1')).toEqual({
      organization: { _type: 'reference', _ref: 'org-1' },
    })
  })

  it('spreads nothing for null/undefined/empty', () => {
    expect(organizationField(null)).toEqual({})
    expect(organizationField(undefined)).toEqual({})
    expect(organizationField('')).toEqual({})
  })
})

describe('organizationReference', () => {
  it('builds a bare reference or undefined', () => {
    expect(organizationReference('org-1')).toEqual({
      _type: 'reference',
      _ref: 'org-1',
    })
    expect(organizationReference(null)).toBeUndefined()
  })
})

// --- getOrganizationRefForCurrentConference --------------------------------

describe('getOrganizationRefForCurrentConference', () => {
  it('returns the current conference organization ref', async () => {
    getConferenceForCurrentDomainMock.mockResolvedValue({
      conference: { _id: 'conf-1', organization: { _ref: 'org-1' } },
      error: null,
    })
    expect(await getOrganizationRefForCurrentConference()).toBe('org-1')
  })

  it('returns null when the conference has no organization (pre-backfill)', async () => {
    getConferenceForCurrentDomainMock.mockResolvedValue({
      conference: { _id: 'conf-1' },
      error: null,
    })
    expect(await getOrganizationRefForCurrentConference()).toBeNull()
  })

  it('returns null on a resolution error', async () => {
    getConferenceForCurrentDomainMock.mockResolvedValue({
      conference: {},
      error: new Error('no domain'),
    })
    expect(await getOrganizationRefForCurrentConference()).toBeNull()
  })

  it('swallows a thrown error and returns null (never a write gate)', async () => {
    getConferenceForCurrentDomainMock.mockRejectedValue(new Error('boom'))
    expect(await getOrganizationRefForCurrentConference()).toBeNull()
  })
})

// --- getOrganizationRefViaParentConference ---------------------------------

describe('getOrganizationRefViaParentConference', () => {
  it('dereferences the parent conference organization ref', async () => {
    fetchMock.mockResolvedValue('org-1')
    const ref = await getOrganizationRefViaParentConference('conversation-1')
    expect(ref).toBe('org-1')
    // The GROQ must traverse parent -> conference -> organization.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('conference->organization._ref'),
      { parentId: 'conversation-1' },
    )
  })

  it('returns null for a missing parent id without querying', async () => {
    expect(await getOrganizationRefViaParentConference(null)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns null when the parent chain has no organization', async () => {
    fetchMock.mockResolvedValue(null)
    expect(await getOrganizationRefViaParentConference('x')).toBeNull()
  })

  it('swallows a query error and returns null', async () => {
    fetchMock.mockRejectedValue(new Error('boom'))
    expect(await getOrganizationRefViaParentConference('x')).toBeNull()
  })
})
