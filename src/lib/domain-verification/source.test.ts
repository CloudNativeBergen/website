import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sanity = vi.hoisted(() => ({
  getDomainVerification: vi.fn(),
  listAllowlistCandidates: vi.fn(),
  listDomainVerificationsForConference: vi.fn(),
  getDomainClaim: vi.fn(),
  getClaimingConference: vi.fn(),
}))
vi.mock('./sanity', () => sanity)
vi.mock('@/lib/conference/merge', () => ({
  mergeConference: vi.fn(async (c: unknown) => c),
}))
vi.mock('@/lib/konf-api/client', () => ({
  konfApiUrl: () => 'https://api.test/graphql',
  konfApiHeaders: async (host: string) => ({ 'x-host': host }),
}))

import {
  clearMissCache,
  domainVerificationSource,
  readAllowlistCandidates,
  readDomainClaim,
  readDomainVerification,
} from './source'

const row = (over: Record<string, unknown> = {}) => ({
  hostname: 'conf.example.com',
  conferenceId: 'conf-1',
  method: 'dns-txt',
  status: 'verified',
  token: 'tok',
  verifiedAt: '2026-11-01T00:00:00.000Z',
  lastSuccessAt: null,
  lastCheckedAt: null,
  firstFailureAt: null,
  graceUntil: null,
  consecutiveFailures: 0,
  consecutiveSoftFailures: 0,
  lastError: null,
  ...over,
})
const answer = (rows: unknown[]) =>
  new Response(JSON.stringify({ data: { siteDomainRecords: rows } }))

const fetchMock = vi.fn()

beforeEach(() => {
  clearMissCache()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation(async () => answer([row()]))
  vi.stubEnv('DOMAIN_VERIFICATION_SOURCE', 'd1')
  vi.stubEnv('DOMAIN_VERIFICATION_D1_HOST', 'dir.example.com')
  vi.stubEnv('KONF_SITE_SIGNING_KEY', '{}')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('domainVerificationSource', () => {
  it.each([
    [undefined, 'sanity'],
    ['', 'sanity'],
    ['D1', 'sanity'],
    ['sanity', 'sanity'],
    [' d1 ', 'd1'],
  ])('%s -> %s', (v, want) => {
    expect(
      domainVerificationSource({
        DOMAIN_VERIFICATION_SOURCE: v,
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(want)
  })

  it('reads Sanity, and never the gateway, by default', async () => {
    vi.stubEnv('DOMAIN_VERIFICATION_SOURCE', '')
    sanity.getDomainVerification.mockResolvedValue({ hostname: 's' })
    expect(await readDomainVerification('conf.example.com')).toEqual({
      hostname: 's',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the d1 source', () => {
  it('maps a row to the record the policy reads, without touching Sanity', async () => {
    expect(await readDomainVerification('Conf.Example.com')).toMatchObject({
      _id: 'domainVerification.conf.example.com',
      hostname: 'conf.example.com',
      conferenceId: 'conf-1',
      status: 'verified',
      method: 'dns-txt',
      verifiedAt: '2026-11-01T00:00:00.000Z',
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables).toEqual({ h: 'conf.example.com' })
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      'x-host': 'dir.example.com',
    })
    expect(sanity.getDomainVerification).not.toHaveBeenCalled()
  })

  it('maps method platform to platform-owned', async () => {
    fetchMock.mockResolvedValue(answer([row({ method: 'platform' })]))
    expect((await readDomainVerification('conf.example.com'))?.method).toBe(
      'platform-owned',
    )
  })

  it('asks only for verified rows for the allowlist', async () => {
    await readAllowlistCandidates()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).variables).toEqual({
      s: 'verified',
    })
  })

  it.each(['conf.example.com:8080', 'conf.example.com.'])(
    'drops a row D1 matched for %s, which is not its exact host',
    async (h) => {
      expect(await readDomainVerification(h)).toBeNull()
      expect(await readDomainVerification('conf.example.com')).toMatchObject({
        hostname: 'conf.example.com',
      })
    },
  )

  it('answers a missing row null and caches the miss briefly', async () => {
    fetchMock.mockResolvedValue(answer([]))
    expect(await readDomainVerification('gone.example.com')).toBeNull()
    expect(await readDomainVerification('gone.example.com')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('caches a hit for 60 s, a miss for 30 s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      await readDomainVerification('conf.example.com')
      await readDomainVerification('conf.example.com')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(59_000)
      await readDomainVerification('conf.example.com')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(2_000)
      await readDomainVerification('conf.example.com')
      expect(fetchMock).toHaveBeenCalledTimes(2)
      fetchMock.mockImplementation(async () => answer([]))
      await readDomainVerification('gone.example.com')
      vi.advanceTimersByTime(31_000)
      await readDomainVerification('gone.example.com')
      expect(fetchMock).toHaveBeenCalledTimes(4)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ['an HTTP error', () => new Response('no', { status: 503 })],
    [
      'a GraphQL error',
      () => new Response(JSON.stringify({ errors: [{ message: 'x' }] })),
    ],
    [
      'a null list',
      () => new Response(JSON.stringify({ data: { siteDomainRecords: null } })),
    ],
  ])('throws on %s, and does not cache it', async (_, res) => {
    fetchMock.mockImplementation(async () => res())
    await expect(readDomainVerification('conf.example.com')).rejects.toThrow()
    await expect(readDomainVerification('conf.example.com')).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each(['DOMAIN_VERIFICATION_D1_HOST', 'KONF_SITE_SIGNING_KEY'])(
    'throws without %s, before any fetch',
    async (name) => {
      vi.stubEnv(name, '')
      await expect(readAllowlistCandidates()).rejects.toThrow()
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('reads the claiming conference from Sanity by the row id', async () => {
    sanity.getClaimingConference.mockResolvedValue({ _id: 'conf-1' })
    expect(await readDomainClaim('conf.example.com')).toMatchObject({
      record: { hostname: 'conf.example.com' },
      conference: { _id: 'conf-1' },
    })
    expect(sanity.getClaimingConference).toHaveBeenCalledWith('conf-1')
    expect(sanity.getDomainClaim).not.toHaveBeenCalled()
  })
})
