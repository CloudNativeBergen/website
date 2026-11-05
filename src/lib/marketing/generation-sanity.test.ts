/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'
import {
  commitGeneratedTasks,
  getGenerationContext,
  getPlannedConferences,
  publishedTaskKeys,
} from './generation-sanity'
import { emptyRecords } from './materialize'
import { shortLinkIndexTag } from '@/lib/cache/tags'
import { publishedPair } from './recipes'
const revalidateTag = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({
  revalidateTag,
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
const h = vi.hoisted(() => ({ dataset: [] as Record<string, unknown>[] }))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset: h.dataset, params })).get(),
  },
  clientWrite: {
    transaction: () => {
      const tx = {
        create: () => tx,
        patch: () => tx,
        commit: async () => ({}),
      }
      return tx
    },
  },
}))
const variant = (
  _id: string,
  key: string,
  extra: Record<string, unknown> = {},
) => ({
  _id,
  _type: 'socialPostVariant',
  conference: { _ref: 'conf-A' },
  status: 'published',
  link: `https://example.com/tickets?utm_campaign=sponsors&utm_content=${encodeURIComponent(key)}`,
  ...extra,
})
beforeEach(() => {
  h.dataset = []
})
it('recovers unique published keys from surviving live same-conference variants without Tasks', async () => {
  h.dataset = [
    variant('published-li', 'sponsorCard:acme:linkedin'),
    variant('published-bs', 'sponsorCard:acme:bluesky'),
    variant('duplicate', 'sponsorCard:acme:linkedin'),
    variant('foreign', 'foreign-key', { conference: { _ref: 'conf-B' } }),
    variant('drafts.hidden', 'draft-document-key'),
    variant('versions.release.hidden', 'version-document-key'),
    ...['draft', 'scheduled', 'publishing', 'awaiting-manual', 'failed'].map(
      (status) => variant(status, `${status}-key`, { status }),
    ),
    variant('malformed', 'unused', { link: 'not a URL?utm_content=bad-key' }),
    variant('missing', 'unused', { link: 'https://example.com/' }),
    // Not a plan post: no Campaign to belong to.
    variant('campaignless', 'unused', {
      link: 'https://example.com/?utm_content=campaignless-key',
    }),
    // The same Task key sent from a second Campaign is a second post.
    variant('other-campaign', 'unused', {
      link: 'https://example.com/?utm_campaign=custom-1&utm_content=sponsorCard%3Aacme%3Alinkedin',
    }),
    variant('empty', ''),
    variant('null', 'unused', { link: null }),
    variant('wrong-protocol', 'unused', {
      link: 'javascript:?utm_content=unsafe-key',
    }),
  ]
  expect(await publishedTaskKeys('conf-A')).toEqual(
    new Set([
      publishedPair('sponsors', 'sponsorCard:acme:linkedin'),
      publishedPair('sponsors', 'sponsorCard:acme:bluesky'),
      publishedPair('custom-1', 'sponsorCard:acme:linkedin'),
    ]),
  )
  expect(await publishedTaskKeys('conf-B')).toEqual(
    new Set([publishedPair('sponsors', 'foreign-key')]),
  )
})

it('commitGeneratedTasks expires the conference code index (short-links §2.4)', async () => {
  // Triggers and the recurring expansion create Tasks with NEW codes. Without
  // the expiry the cached membership set still says the conference holds none
  // of them and every generated short link answers the HOME PAGE.
  revalidateTag.mockClear()
  expect(
    await commitGeneratedTasks({
      conferenceId: 'conf-A',
      campaignId: 'camp-1',
      campaignRev: 'rev-1',
      records: emptyRecords(),
    }),
  ).toBe(true)
  expect(revalidateTag).toHaveBeenCalledWith(shortLinkIndexTag('conf-A'), {
    expire: 0,
  })
})

describe('D1 gateway values and fallbacks (#1997)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const confA = {
    _id: 'conf-A',
    _type: 'conference',
    title: 'Sanity Conference A',
    city: 'Sanity City',
    startDate: '2026-08-01',
    endDate: '2026-08-02',
    domains: ['2026.example.com'],
    organization: { _ref: 'org-1' },
  }

  const planA = {
    _id: 'plan-A',
    _type: 'marketingPlan',
    conference: { _type: 'reference', _ref: 'conf-A' },
  }

  it('uses merged D1 conference fields for getGenerationContext when flagged', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-A')

    h.dataset = [structuredClone(confA), structuredClone(planA)]

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-A',
              title: 'D1 Conference A',
              city: 'D1 City',
              startDate: '2026-08-10',
              endDate: '2026-08-12',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getGenerationContext('conf-A')
    expect(result).not.toBeNull()
    expect(result!.conference.title).toBe('D1 Conference A')
    expect(result!.conference.city).toBe('D1 City')
    expect(result!.conference.startDate).toBe('2026-08-10')
    expect(result!.conference.endDate).toBe('2026-08-12')
  })

  it('falls back to Sanity for getGenerationContext when unflagged', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'other-conf')

    h.dataset = [structuredClone(confA), structuredClone(planA)]

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getGenerationContext('conf-A')
    expect(gatewayFetch).not.toHaveBeenCalled()
    expect(result!.conference.title).toBe('Sanity Conference A')
    expect(result!.conference.city).toBe('Sanity City')
    expect(result!.conference.startDate).toBe('2026-08-01')
  })

  it('falls back to Sanity for getGenerationContext on gateway error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-A')

    h.dataset = [structuredClone(confA), structuredClone(planA)]

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'D1 error' }] }), {
        status: 500,
      }),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getGenerationContext('conf-A')
    expect(result!.conference.title).toBe('Sanity Conference A')
    expect(result!.conference.city).toBe('Sanity City')
    expect(result!.conference.startDate).toBe('2026-08-01')
  })

  it('uses merged D1 dates for getPlannedConferences when flagged', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-A')

    h.dataset = [structuredClone(confA), structuredClone(planA)]

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-A',
              startDate: '2026-08-10',
              endDate: '2026-08-12',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getPlannedConferences()
    expect(result).toHaveLength(1)
    expect(result[0].startDate).toBe('2026-08-10')
    expect(result[0].endDate).toBe('2026-08-12')
  })

  it('falls back to Sanity dates for getPlannedConferences when unflagged', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'other-conf')

    h.dataset = [structuredClone(confA), structuredClone(planA)]

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getPlannedConferences()
    expect(gatewayFetch).not.toHaveBeenCalled()
    expect(result[0].startDate).toBe('2026-08-01')
    expect(result[0].endDate).toBe('2026-08-02')
  })

  it('falls back to Sanity dates for getPlannedConferences on gateway error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    vi.stubEnv('KONF_API_TENANTS', 'conf-A')

    h.dataset = [structuredClone(confA), structuredClone(planA)]

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'D1 error' }] }), {
        status: 500,
      }),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const result = await getPlannedConferences()
    expect(result[0].startDate).toBe('2026-08-01')
    expect(result[0].endDate).toBe('2026-08-02')
  })
})
