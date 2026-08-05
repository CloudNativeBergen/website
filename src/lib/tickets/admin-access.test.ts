/**
 * @vitest-environment node
 *
 * The three-way ticketing state the admin pages render — empty ≠ error ≠
 * unavailable. Everything the app owns runs for real: the provider resolver
 * (including its Tito branch), the credential seam and the feature gate. Only
 * the org document read is supplied; no network is involved because the state
 * is decided before any provider call.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Organization } from '@/lib/organization/types'

const getOrganizationById = vi.fn()

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: (...args: unknown[]) => getOrganizationById(...args),
  getOrganizationRefForCurrentConference: () => null,
}))

const h = vi.hoisted(() => ({
  fetch: vi.fn<(query: string, params?: unknown) => Promise<unknown>>(),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
}))

import {
  resolveTicketingAdminAccess,
  ticketingProviderLabel,
} from './admin-access'

const PLATFORM_ORG_ID = 'org-platform'
const TENANT_ORG_ID = 'org-A'

function org(overrides: Partial<Organization> = {}): Organization {
  return {
    _id: TENANT_ORG_ID,
    name: 'Tenant A',
    slug: 'tenant-a',
    ...overrides,
  }
}

const checkinBound = (orgId: string) => ({
  checkinCustomerId: 42,
  checkinEventId: 4242,
  organization: { _ref: orgId },
})

const titoBound = (orgId: string) => ({
  ticketingProvider: 'tito' as const,
  titoAccountSlug: 'cndn',
  titoEventSlug: '2026',
  organization: { _ref: orgId },
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG_ID)
  vi.stubEnv('TENANT_SECRETS_JSON', '')
  vi.stubEnv('CHECKIN_API_KEY', 'platform-checkin-key')
  vi.stubEnv('CHECKIN_API_SECRET', 'platform-checkin-secret')
  vi.stubEnv('TITO_API_KEY', 'platform-tito-key')
  getOrganizationById.mockResolvedValue(org())
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveTicketingAdminAccess — ready', () => {
  it('is READY for the platform org’s fully bound Checkin conference', async () => {
    const access = await resolveTicketingAdminAccess(
      checkinBound(PLATFORM_ORG_ID),
    )
    expect(access.state).toBe('ready')
    expect(access.providerType).toBe('checkin')
    if (access.state !== 'ready') throw new Error('unreachable')
    expect(access.eventRef).toEqual({ customerId: 42, eventId: 4242 })
  })

  /**
   * THE TITO FIX. Every ticket page hardcoded the Checkin field check, so a
   * Tito-bound conference could never open one however complete its binding —
   * even though `resolveTicketingProvider` has supported Tito all along.
   */
  it('is READY for a fully bound TITO conference, with a Tito event ref', async () => {
    const access = await resolveTicketingAdminAccess(titoBound(PLATFORM_ORG_ID))
    expect(access.state).toBe('ready')
    expect(access.providerType).toBe('tito')
    if (access.state !== 'ready') throw new Error('unreachable')
    expect(access.eventRef).toEqual({
      provider: 'tito',
      accountSlug: 'cndn',
      eventSlug: '2026',
    })
  })

  it('is READY for a tenant with its OWN credentials — the gate never hides what works', async () => {
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({
        [TENANT_ORG_ID]: { ticketing: { apiKey: 'tenant-key' } },
      }),
    )
    const access = await resolveTicketingAdminAccess(
      checkinBound(TENANT_ORG_ID),
    )
    expect(access.state).toBe('ready')
  })
})

describe('resolveTicketingAdminAccess — unconfigured (entitled, not bound)', () => {
  it('is UNCONFIGURED for the platform org with no event binding', async () => {
    getOrganizationById.mockResolvedValue(org({ _id: PLATFORM_ORG_ID }))
    const access = await resolveTicketingAdminAccess({
      organization: { _ref: PLATFORM_ORG_ID },
    })
    expect(access).toEqual({ state: 'unconfigured', providerType: 'checkin' })
  })

  it('is UNCONFIGURED for a Tito conference missing one of its two slugs', async () => {
    getOrganizationById.mockResolvedValue(org({ _id: PLATFORM_ORG_ID }))
    const access = await resolveTicketingAdminAccess({
      ticketingProvider: 'tito',
      titoAccountSlug: 'cndn',
      organization: { _ref: PLATFORM_ORG_ID },
    })
    expect(access).toEqual({ state: 'unconfigured', providerType: 'tito' })
  })

  it('is UNCONFIGURED for an org granted ticketing by override but not yet bound', async () => {
    getOrganizationById.mockResolvedValue(
      org({ featureOverrides: [{ feature: 'ticketing', enabled: true }] }),
    )
    const access = await resolveTicketingAdminAccess({
      organization: { _ref: TENANT_ORG_ID },
    })
    expect(access.state).toBe('unconfigured')
  })
})

describe('resolveTicketingAdminAccess — unavailable (not entitled)', () => {
  /** THE DEMO-ORG CASE: the state that replaces the red configuration error. */
  it('is UNAVAILABLE for a brand-new tenant with nothing configured', async () => {
    const access = await resolveTicketingAdminAccess({
      organization: { _ref: TENANT_ORG_ID },
    })
    expect(access).toEqual({ state: 'unavailable', providerType: 'checkin' })
  })

  /**
   * #820: filling in the ids is NOT enough for a tenant without credentials.
   * That combination used to reach the fetch and surface a raw error; it is an
   * unavailable state, never an error.
   */
  it('is UNAVAILABLE for a tenant that filled in event ids but has no credentials', async () => {
    const access = await resolveTicketingAdminAccess(
      checkinBound(TENANT_ORG_ID),
    )
    expect(access.state).toBe('unavailable')
  })

  it('is UNAVAILABLE for a conference with no owning organization (fail closed)', async () => {
    const access = await resolveTicketingAdminAccess({
      checkinCustomerId: 42,
      checkinEventId: 4242,
    })
    expect(access.state).toBe('unavailable')
  })

  it('is UNAVAILABLE when an explicit DENY revokes ticketing from the platform org', async () => {
    getOrganizationById.mockResolvedValue(
      org({
        _id: PLATFORM_ORG_ID,
        featureOverrides: [{ feature: 'ticketing', enabled: false }],
      }),
    )
    const access = await resolveTicketingAdminAccess({
      organization: { _ref: PLATFORM_ORG_ID },
    })
    expect(access.state).toBe('unavailable')
  })
})

describe('ticketingProviderLabel', () => {
  it('names the vendor the organizer actually uses', () => {
    expect(ticketingProviderLabel('checkin')).toBe('Checkin.no')
    expect(ticketingProviderLabel('tito')).toBe('Tito')
  })
})
