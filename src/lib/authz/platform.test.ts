/**
 * @vitest-environment node
 *
 * Unit tests for the PLATFORM-OPERATOR gate (onboarding S1). This guards
 * cross-tenant creation: the deprecated global `isOrganizer` never grants, and it
 * fails closed on every unresolvable input (env unset/blank).
 *
 * Since RunKonf/platform#43 the platform org is the CONFIGURED document id
 * (`PLATFORM_ORG_ID`), resolved with NO Sanity read — the slug lookup is gone.
 * The `clientReadUncached` mock below is a TRIPWIRE, not a dependency: the
 * resolver must never touch the content lake, so a reintroduced slug lookup will
 * call it and fail the `not.toHaveBeenCalled()` guards.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  fetch: vi.fn<(query: string, params?: unknown) => Promise<unknown>>(),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
}))

import {
  resolvePlatformOrgId,
  getPlatformOrgId,
  isPlatformOperatorForOrg,
  isPlatformOperator,
} from './platform'

const PLATFORM_ORG_ID = 'org-platform'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.PLATFORM_ORG_ID = PLATFORM_ORG_ID
  // If the resolver ever reads Sanity again, this is what it would get — and the
  // no-fetch assertions would catch it before the value ever mattered.
  h.fetch.mockResolvedValue('slug-resolved-id-that-must-never-be-used')
})

afterEach(() => {
  delete process.env.PLATFORM_ORG_ID
})

describe('resolvePlatformOrgId', () => {
  it('returns the trimmed id, or null when unset/blank', () => {
    expect(resolvePlatformOrgId()).toBe(PLATFORM_ORG_ID)
    process.env.PLATFORM_ORG_ID = '  '
    expect(resolvePlatformOrgId()).toBeNull()
    delete process.env.PLATFORM_ORG_ID
    expect(resolvePlatformOrgId()).toBeNull()
  })
})

describe('getPlatformOrgId', () => {
  it('returns the configured id with NO Sanity read (SABOTAGE: a slug lookup fails here)', async () => {
    await expect(getPlatformOrgId()).resolves.toBe(PLATFORM_ORG_ID)
    // The load-bearing guard: reintroducing any slug→id fetch trips this.
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('returns null — still without querying — when the env is unset', async () => {
    delete process.env.PLATFORM_ORG_ID
    await expect(getPlatformOrgId()).resolves.toBeNull()
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('returns null — still without querying — when the env is blank', async () => {
    process.env.PLATFORM_ORG_ID = '   '
    await expect(getPlatformOrgId()).resolves.toBeNull()
    expect(h.fetch).not.toHaveBeenCalled()
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
  it('grants a platform-org organizer without reading Sanity', async () => {
    await expect(
      isPlatformOperator({ _id: 'sp-1', organizerOrgIds: [PLATFORM_ORG_ID] }),
    ).resolves.toBe(true)
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('denies when the env is not configured (surface disabled)', async () => {
    delete process.env.PLATFORM_ORG_ID
    await expect(
      isPlatformOperator({ _id: 'sp-1', organizerOrgIds: [PLATFORM_ORG_ID] }),
    ).resolves.toBe(false)
  })
})
