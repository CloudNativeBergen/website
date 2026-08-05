/**
 * @vitest-environment node
 *
 * WHAT THE ADMIN SHELL IS TOLD the current org is entitled to.
 *
 * The layout used to compute `enabledFeatures` as literally `['workshops']` or
 * `[]`, so the registry's `feature` tag could gate exactly one destination and
 * nothing else — tagging Tickets or Badges would have had no effect at all.
 * This pins the layout to the REAL entitlement resolution: only the Sanity org
 * document and the auth boundary are mocked, and `AdminLayout` itself is a
 * probe that records the feature list it was handed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const mockGetConference = vi.fn()
const mockGetOrganizationById = vi.fn()
const mockIsOrganizer = vi.fn()

vi.mock('@/lib/auth', () => ({
  getAuthSession: async () => ({ speaker: { _id: 'speaker-1' } }),
}))

vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: (...args: unknown[]) => mockIsOrganizer(...args),
  resolveCurrentOrgId: async () => null,
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    mockGetConference(...args),
}))

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: (...args: unknown[]) => mockGetOrganizationById(...args),
  getOrganizationRefForCurrentConference: () => null,
}))

const h = vi.hoisted(() => ({ fetch: vi.fn(async () => null) }))

vi.mock('@/lib/sanity/client', () => ({
  clientRead: { fetch: h.fetch },
  clientReadUncached: { fetch: h.fetch },
}))

vi.mock('@/components/admin', () => ({
  AdminLayout: ({ enabledFeatures }: { enabledFeatures: string[] }) => (
    <div data-features={enabledFeatures.join(',')} />
  ),
}))

import AdminRootLayout from '@/app/(admin)/admin/layout'

const PLATFORM_ORG_ID = 'org-platform'

/** The feature list the shell received, parsed back out of the probe. */
async function enabledFeatures(): Promise<string[]> {
  const markup = renderToStaticMarkup(
    (await AdminRootLayout({ children: null })) as React.ReactElement,
  )
  const match = markup.match(/data-features="([^"]*)"/)
  if (!match) throw new Error(`AdminLayout was not rendered: ${markup}`)
  return match[1] ? match[1].split(',') : []
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG_ID)
  vi.stubEnv('TENANT_SECRETS_JSON', '')
  mockIsOrganizer.mockResolvedValue(true)
  mockGetConference.mockResolvedValue({
    conference: {
      _id: 'conf-1',
      title: 'Tenant Conf',
      organization: { _ref: 'org-A', _type: 'reference' },
    },
    error: null,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('admin layout — enabled features', () => {
  it('hands a brand-new tenant NO features, so every gated destination hides', async () => {
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-A',
      name: 'Tenant A',
      slug: 'tenant-a',
      plan: 'community',
    })
    await expect(enabledFeatures()).resolves.toEqual([])
  })

  it('hands the platform org its platform-default features', async () => {
    mockGetConference.mockResolvedValue({
      conference: {
        _id: 'conf-1',
        title: 'Platform Conf',
        organization: { _ref: PLATFORM_ORG_ID, _type: 'reference' },
      },
      error: null,
    })
    mockGetOrganizationById.mockResolvedValue({
      _id: PLATFORM_ORG_ID,
      name: 'Platform',
      slug: 'platform-org',
    })
    await expect(enabledFeatures()).resolves.toEqual([
      'workshops',
      'ticketing',
      'badges',
    ])
  })

  /** The entry paid tier buys ticketing (owner decision, 2026-08-06). */
  it('gives a pro tenant the ticketing destination on plan alone', async () => {
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-A',
      name: 'Tenant A',
      slug: 'tenant-a',
      plan: 'pro',
    })
    await expect(enabledFeatures()).resolves.toContain('ticketing')
  })

  /** The nav side of the kill switch: a deny beats the plan that sold it. */
  it('hides ticketing from a paid tenant an operator has denied', async () => {
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-A',
      name: 'Tenant A',
      slug: 'tenant-a',
      plan: 'pro',
      featureOverrides: [{ feature: 'ticketing', enabled: false }],
    })
    await expect(enabledFeatures()).resolves.not.toContain('ticketing')
  })

  it('honours a per-feature override — not just workshops', async () => {
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-A',
      name: 'Pilot',
      slug: 'pilot',
      plan: 'community',
      featureOverrides: [{ feature: 'ticketing', enabled: true }],
    })
    await expect(enabledFeatures()).resolves.toEqual(['ticketing'])
  })

  it('hands NO features to an unresolvable tenant (fail closed)', async () => {
    mockGetConference.mockResolvedValue({
      conference: { _id: 'conf-1', title: 'Orphan' },
      error: null,
    })
    await expect(enabledFeatures()).resolves.toEqual([])
    expect(mockGetOrganizationById).not.toHaveBeenCalled()
  })
})
