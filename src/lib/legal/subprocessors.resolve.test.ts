/**
 * @vitest-environment node
 *
 * The /privacy Buffer disclosure across TWO tenants (#1130, review of #1242).
 * The real resolver, the real secret stores (the JSON blob store with its
 * parsed-blob cache, and the discrete per-org env store with its slug map)
 * and the real connection derivation all run. Only the boundaries are
 * scripted: `process.env` (the secret store's source) and the Sanity client.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Conference } from '@/lib/conference/types'

const fetchMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientRead: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientWrite: { fetch: (...args: unknown[]) => fetchMock(...args) },
}))
vi.mock('next/cache', () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
}))

const { resolveSubprocessorDisclosure } =
  await import('./subprocessors.resolve')

const ORG_A = 'org-a-buffer'
const ORG_B = 'org-b-none'

const conference = (id: string, orgId: string) =>
  ({
    _id: id,
    title: id,
    organization: { _ref: orgId },
  }) as unknown as Conference

/** The Sanity boundary: each org document by id, and nobody's env slug. */
function sanity(query: string, params?: { orgId?: string }) {
  if (query.includes('secretEnvSlug')) return Promise.resolve([])
  if (query.includes('_type == "organization"') && params?.orgId)
    return Promise.resolve({ _id: params.orgId, name: params.orgId })
  return Promise.resolve(null)
}

const buffer = (d: Awaited<ReturnType<typeof resolveSubprocessorDisclosure>>) =>
  d.processors.find((p) => p.id === 'buffer')
const workos = (d: Awaited<ReturnType<typeof resolveSubprocessorDisclosure>>) =>
  d.processors.find((p) => p.id === 'workos')

let savedBlob: string | undefined
beforeEach(() => {
  savedBlob = process.env.TENANT_SECRETS_JSON
  // A's `buffer` bag is COMPLETE; B has no bag at all.
  process.env.TENANT_SECRETS_JSON = JSON.stringify({
    [ORG_A]: {
      buffer: { apiKey: 'buf-key-A', linkedinChannelId: 'li-channel-A' },
    },
  })
  fetchMock.mockReset()
  fetchMock.mockImplementation(sanity)
})
afterEach(() => {
  if (savedBlob === undefined) delete process.env.TENANT_SECRETS_JSON
  else process.env.TENANT_SECRETS_JSON = savedBlob
})

describe('/privacy Buffer disclosure, two tenants', () => {
  it('confirms Buffer for the org that uses it and never for the one that does not, in any order', async () => {
    const a = conference('conf-a', ORG_A)
    const b = conference('conf-b', ORG_B)
    // A first (warms every process-level cache on A's answer), then B, then
    // both at once, then B again: nothing A resolved may surface for B.
    const first = await resolveSubprocessorDisclosure(a)
    const afterA = await resolveSubprocessorDisclosure(b)
    const [bothA, bothB] = await Promise.all([
      resolveSubprocessorDisclosure(a),
      resolveSubprocessorDisclosure(b),
    ])
    const again = await resolveSubprocessorDisclosure(b)

    for (const d of [first, bothA])
      expect(buffer(d)).toMatchObject({ id: 'buffer', certainty: 'confirmed' })
    for (const d of [afterA, bothB, again]) expect(buffer(d)).toBeUndefined()
    // No secret value reaches the disclosure, for either tenant.
    expect(JSON.stringify([first, afterA, bothA, bothB, again])).not.toMatch(
      /buf-key|li-channel/,
    )
  })

  it('B first, then A: a cold start on the tenant without Buffer does not hide it from A', async () => {
    const b = await resolveSubprocessorDisclosure(conference('conf-b', ORG_B))
    const a = await resolveSubprocessorDisclosure(conference('conf-a', ORG_A))
    expect(buffer(b)).toBeUndefined()
    expect(buffer(a)).toMatchObject({ certainty: 'confirmed' })
  })

  it('a half-filled bag for B is still not a disclosure (the publish derivation, not bag presence)', async () => {
    process.env.TENANT_SECRETS_JSON = JSON.stringify({
      [ORG_A]: { buffer: { apiKey: 'k', linkedinChannelId: 'c' } },
      [ORG_B]: { buffer: { apiKey: 'k-only' } },
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const b = await resolveSubprocessorDisclosure(conference('conf-b', ORG_B))
    const a = await resolveSubprocessorDisclosure(conference('conf-a', ORG_A))
    expect(buffer(b)).toBeUndefined()
    expect(buffer(a)).toMatchObject({ certainty: 'confirmed' })
    vi.restoreAllMocks()
  })

  it('a refused lookup for B discloses Buffer as POSSIBLE and names no slug or other org — A is untouched', async () => {
    // The REAL discrete store refusing: B and a third org claim one slug,
    // and a complete TENANT_ACME_BUFFER_* set exists on the deployment.
    process.env.TENANT_ACME_BUFFER_API_KEY = 'acme-key'
    process.env.TENANT_ACME_BUFFER_LINKEDIN_CHANNEL_ID = 'acme-channel'
    fetchMock.mockImplementation(
      (query: string, params?: { orgId?: string }) =>
        query.includes('secretEnvSlug')
          ? Promise.resolve([
              { _id: ORG_B, secretEnvSlug: 'ACME' },
              { _id: 'org-c-other', secretEnvSlug: 'ACME' },
            ])
          : sanity(query, params),
    )
    try {
      const b = await resolveSubprocessorDisclosure(conference('conf-b', ORG_B))
      const a = await resolveSubprocessorDisclosure(conference('conf-a', ORG_A))
      expect(buffer(b)).toMatchObject({ certainty: 'possible' })
      expect(JSON.stringify(b)).not.toMatch(/ACME|org-c-other|acme-/)
      expect(buffer(a)).toMatchObject({ certainty: 'confirmed' })
    } finally {
      delete process.env.TENANT_ACME_BUFFER_API_KEY
      delete process.env.TENANT_ACME_BUFFER_LINKEDIN_CHANNEL_ID
    }
  })

  /**
   * #1295: the workshop gate consults the per-org TICKETING secret stores and
   * swallows a refused lookup into `false`. A refused lookup is "could not find
   * out", so this page must disclose WorkOS as POSSIBLE for a pro org — not
   * drop it — while a healthy lookup that finds no secret is a real "no".
   */
  it('a refused ticketing-secret lookup for a pro org discloses WorkOS as POSSIBLE; a healthy miss does not', async () => {
    const proOrg = (query: string, params?: { orgId?: string }) =>
      query.includes('_type == "organization"') && params?.orgId === ORG_B
        ? Promise.resolve({ _id: ORG_B, name: ORG_B, plan: 'pro' })
        : sanity(query, params)

    // Healthy slug map, no secret for B: workshops genuinely off.
    fetchMock.mockImplementation(proOrg)
    const healthy = await resolveSubprocessorDisclosure(
      conference('conf-b', ORG_B),
    )
    expect(workos(healthy)?.certainty).not.toBe('possible')

    // The REAL discrete store refusing: B and a third org claim one slug, and
    // a complete TENANT_ACME_CHECKIN_* set exists on the deployment.
    process.env.TENANT_ACME_CHECKIN_API_KEY = 'acme-key'
    process.env.TENANT_ACME_CHECKIN_API_SECRET = 'acme-secret'
    process.env.TENANT_ACME_CHECKIN_WEBHOOK_SECRET = 'acme-hook'
    fetchMock.mockImplementation(
      (query: string, params?: { orgId?: string }) =>
        query.includes('secretEnvSlug')
          ? Promise.resolve([
              { _id: ORG_B, secretEnvSlug: 'ACME' },
              { _id: 'org-c-other', secretEnvSlug: 'ACME' },
            ])
          : proOrg(query, params),
    )
    try {
      const refused = await resolveSubprocessorDisclosure(
        conference('conf-b2', ORG_B),
      )
      expect(workos(refused)).toMatchObject({ certainty: 'possible' })
      expect(JSON.stringify(refused)).not.toMatch(/ACME|org-c-other|acme-/)
    } finally {
      delete process.env.TENANT_ACME_CHECKIN_API_KEY
      delete process.env.TENANT_ACME_CHECKIN_API_SECRET
      delete process.env.TENANT_ACME_CHECKIN_WEBHOOK_SECRET
    }
  })
})
