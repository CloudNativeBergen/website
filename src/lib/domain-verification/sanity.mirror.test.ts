import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * #2207 phase 5: every Sanity write of a `domainVerification` record is copied
 * onto D1, and a D1 failure never fails (or undoes) the Sanity write.
 */

const fetchMock = vi.fn<(q: string) => Promise<unknown>>()
const commit = vi.fn<() => Promise<void>>()
const createIfNotExists = vi.fn<(doc: unknown) => Promise<void>>()
const chain = () => ({ set: () => chain(), unset: () => chain(), commit })
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (q: string) => fetchMock(q) },
  clientWrite: { createIfNotExists, patch: () => chain() },
}))
const mirror = vi.fn<(host: string, record: unknown) => Promise<void>>()
vi.mock('@/lib/konf-api/conference-write', () => ({
  mirrorDomainVerificationViaApi: (host: string, record: unknown) =>
    mirror(host, record),
}))

const {
  ensureDomainVerification,
  revokeDomainVerification,
  patchDomainVerification,
} = await import('./sanity')

const STORED = {
  _id: 'domainVerification.conf.example.com',
  hostname: 'conf.example.com',
  conferenceId: 'conference-1',
  token: 'tok',
  status: 'failing',
  method: 'dns-txt',
  consecutiveFailures: 2,
  consecutiveSoftFailures: 0,
  domains: ['conf.example.com', 'acme.konf.run'],
}
/** Reads before the write find nothing (a new claim); the mirror's read finds the stored doc. */
const stored = (q: string) =>
  Promise.resolve(q.includes('"domains": conference->domains') ? STORED : null)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
  vi.stubEnv('KONF_API_URL', 'https://api.test/graphql')
  vi.stubEnv('KONF_SITE_SIGNING_KEY', '{}')
  fetchMock.mockImplementation(stored)
  mirror.mockResolvedValue(undefined)
  commit.mockResolvedValue(undefined)
  createIfNotExists.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())

describe('D1 dual write', () => {
  it('copies a new claim, from the platform host, after the Sanity write', async () => {
    await ensureDomainVerification('conf.example.com', 'conference-1')
    expect(createIfNotExists).toHaveBeenCalledTimes(1)
    expect(mirror).toHaveBeenCalledTimes(1)
    const [host, record] = mirror.mock.calls[0]!
    expect(host).toBe('acme.konf.run')
    expect(record).toMatchObject({
      hostname: 'conf.example.com',
      conferenceId: 'conference-1',
      status: 'failing',
      consecutiveFailures: 2,
      lastError: null,
    })
    expect(record).not.toHaveProperty('domains')
  })

  it('copies the daily check write-back and a release', async () => {
    await patchDomainVerification(STORED._id, { status: 'failing' })
    fetchMock.mockResolvedValue(STORED)
    await revokeDomainVerification('conf.example.com', 'conference-1')
    expect(commit).toHaveBeenCalledTimes(2)
    expect(mirror).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['rejects', () => mirror.mockRejectedValue(new Error('HTTP 503'))],
    [
      'cannot be read',
      () =>
        fetchMock.mockImplementation((q) =>
          q.includes('"domains": conference->domains')
            ? Promise.reject(new Error('sanity down'))
            : Promise.resolve(null),
        ),
    ],
  ])('never fails the Sanity write when D1 %s', async (_, arrange) => {
    arrange()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      ensureDomainVerification('conf.example.com', 'conference-1'),
    ).resolves.toBeUndefined()
    await expect(
      patchDomainVerification(STORED._id, { status: 'verified' }),
    ).resolves.toBeUndefined()
    expect(createIfNotExists).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('D1 mirror failed'),
      expect.any(Error),
    )
  })

  it('sends nothing without the site key or a gateway', async () => {
    vi.stubEnv('KONF_SITE_SIGNING_KEY', '')
    await patchDomainVerification(STORED._id, { status: 'failing' })
    vi.stubEnv('KONF_SITE_SIGNING_KEY', '{}')
    vi.stubEnv('KONF_API_URL', '')
    vi.stubEnv('VERCEL_ENV', 'preview')
    await patchDomainVerification(STORED._id, { status: 'failing' })
    expect(commit).toHaveBeenCalledTimes(2)
    expect(mirror).not.toHaveBeenCalled()
  })
})
