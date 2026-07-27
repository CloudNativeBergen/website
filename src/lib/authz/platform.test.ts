/**
 * @vitest-environment node
 *
 * Unit tests for the PLATFORM-OPERATOR gate (onboarding S1). This guards
 * cross-tenant creation, so it is deliberately STRICTER than the tenant waist:
 * no legacy-token bridge (the deprecated global `isOrganizer` never grants),
 * and fail-closed on every unresolvable input (env unset, unknown slug,
 * transient read failure).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  fetch: vi.fn<(query: string, params?: unknown) => Promise<unknown>>(),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
}))

import {
  resolvePlatformOrgSlug,
  getPlatformOrgId,
  isPlatformOperatorForOrg,
  isPlatformOperator,
} from './platform'

const PLATFORM_ORG_ID = 'org-platform'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.PLATFORM_ORG_SLUG = 'runkonf'
  h.fetch.mockResolvedValue(PLATFORM_ORG_ID)
})

afterEach(() => {
  delete process.env.PLATFORM_ORG_SLUG
})

describe('resolvePlatformOrgSlug', () => {
  it('returns the trimmed slug, or null when unset/blank', () => {
    expect(resolvePlatformOrgSlug()).toBe('runkonf')
    process.env.PLATFORM_ORG_SLUG = '  '
    expect(resolvePlatformOrgSlug()).toBeNull()
    delete process.env.PLATFORM_ORG_SLUG
    expect(resolvePlatformOrgSlug()).toBeNull()
  })
})

describe('getPlatformOrgId', () => {
  it('resolves the org id by slug', async () => {
    await expect(getPlatformOrgId()).resolves.toBe(PLATFORM_ORG_ID)
    expect(h.fetch).toHaveBeenCalledWith(
      expect.stringContaining('slug.current'),
      {
        slug: 'runkonf',
      },
    )
  })

  it('returns null without querying when the env is unset', async () => {
    delete process.env.PLATFORM_ORG_SLUG
    await expect(getPlatformOrgId()).resolves.toBeNull()
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('returns null on an unknown slug or a transient read failure', async () => {
    h.fetch.mockResolvedValueOnce(null)
    await expect(getPlatformOrgId()).resolves.toBeNull()
    h.fetch.mockRejectedValueOnce(new Error('boom'))
    await expect(getPlatformOrgId()).resolves.toBeNull()
  })
})

describe('isPlatformOperatorForOrg — the pure decision', () => {
  it('grants a modern token whose organizerOrgIds contains the platform org', () => {
    expect(
      isPlatformOperatorForOrg(
        { _id: 'sp-1', organizerOrgIds: ['org-other', PLATFORM_ORG_ID] },
        PLATFORM_ORG_ID,
      ),
    ).toBe(true)
  })

  it('denies an organizer of only OTHER orgs', () => {
    expect(
      isPlatformOperatorForOrg(
        { _id: 'sp-1', organizerOrgIds: ['org-other'] },
        PLATFORM_ORG_ID,
      ),
    ).toBe(false)
  })

  it('denies a LEGACY token even with the deprecated global flag set (no bridge)', () => {
    expect(
      isPlatformOperatorForOrg(
        { _id: 'sp-1', isOrganizer: true } as never,
        PLATFORM_ORG_ID,
      ),
    ).toBe(false)
  })

  it('fails closed on a null platform org or missing speaker', () => {
    expect(
      isPlatformOperatorForOrg(
        { _id: 'sp-1', organizerOrgIds: [PLATFORM_ORG_ID] },
        null,
      ),
    ).toBe(false)
    expect(isPlatformOperatorForOrg(null, PLATFORM_ORG_ID)).toBe(false)
    expect(isPlatformOperatorForOrg(undefined, PLATFORM_ORG_ID)).toBe(false)
  })
})

describe('isPlatformOperator — the request-level check', () => {
  it('grants a platform-org organizer', async () => {
    await expect(
      isPlatformOperator({ _id: 'sp-1', organizerOrgIds: [PLATFORM_ORG_ID] }),
    ).resolves.toBe(true)
  })

  it('denies when the env is not configured (surface disabled)', async () => {
    delete process.env.PLATFORM_ORG_SLUG
    await expect(
      isPlatformOperator({ _id: 'sp-1', organizerOrgIds: [PLATFORM_ORG_ID] }),
    ).resolves.toBe(false)
  })
})
