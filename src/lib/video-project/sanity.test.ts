/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

const scopedFetchMock = vi.fn()
vi.mock('@/lib/sanity/scoped', () => ({
  scopedFetch: (...args: unknown[]) => scopedFetchMock(...args),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn() },
  clientWrite: {},
}))

import { listVideoProjects, readVideoProject } from './sanity'

describe('listVideoProjects D1 gateway values and fallbacks (#1997)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const sanityRow = {
    _id: 'vp-1',
    title: 'Project 1',
    scope: 'edition' as const,
    edition: 'Sanity Edition Title',
    conference: {
      _id: 'conf-1',
      title: 'Sanity Edition Title',
      domains: ['video.example.com'],
      organization: { _ref: 'org-1' },
    },
    updatedAt: '2026-08-01T12:00:00Z',
    scenes: 3,
  }

  it('uses merged D1 edition title when flagged and D1 value differs', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    scopedFetchMock.mockResolvedValue([structuredClone(sanityRow)])

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-1',
              title: 'D1 Edition Title',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const projects = await listVideoProjects('org-1')
    expect(projects).toHaveLength(1)
    expect(projects[0].edition).toBe('D1 Edition Title')
  })

  it('falls back to Sanity edition title when unflagged', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'other-conf')
    scopedFetchMock.mockResolvedValue([structuredClone(sanityRow)])

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const projects = await listVideoProjects('org-1')
    expect(gatewayFetch).not.toHaveBeenCalled()
    expect(projects[0].edition).toBe('Sanity Edition Title')
  })

  it('falls back to Sanity edition title on gateway error', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    scopedFetchMock.mockResolvedValue([structuredClone(sanityRow)])

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'D1 down' }] }), {
        status: 500,
      }),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const projects = await listVideoProjects('org-1')
    expect(projects[0].edition).toBe('Sanity Edition Title')
  })
})

describe('readVideoProject D1 gateway values and fallbacks (#1997)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const sanityProject = {
    _id: 'vp-1',
    _rev: 'rev-1',
    title: 'Project 1',
    formatVersion: 1,
    scope: 'edition' as const,
    edition: 'Sanity Edition Title',
    conference: {
      _id: 'conf-1',
      title: 'Sanity Edition Title',
      domains: ['video.example.com'],
      organization: { _ref: 'org-1' },
    },
    scenes: [],
    track: null,
  }

  it('uses merged D1 edition title when flagged and D1 value differs', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    scopedFetchMock.mockResolvedValue(structuredClone(sanityProject))

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-1',
              title: 'D1 Edition Title',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const project = await readVideoProject('org-1', 'vp-1')
    expect(project).not.toBeNull()
    expect(project?.edition).toBe('D1 Edition Title')
  })

  it('falls back to Sanity edition title when unflagged', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'other-conf')
    scopedFetchMock.mockResolvedValue(structuredClone(sanityProject))

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const project = await readVideoProject('org-1', 'vp-1')
    expect(gatewayFetch).not.toHaveBeenCalled()
    expect(project?.edition).toBe('Sanity Edition Title')
  })

  it('falls back to Sanity edition title on gateway error', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    scopedFetchMock.mockResolvedValue(structuredClone(sanityProject))

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'D1 down' }] }), {
        status: 500,
      }),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const project = await readVideoProject('org-1', 'vp-1')
    expect(project?.edition).toBe('Sanity Edition Title')
  })
})
