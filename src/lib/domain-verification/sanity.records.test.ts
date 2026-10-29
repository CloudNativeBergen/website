import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parse, evaluate } from 'groq-js'

type Doc = Record<string, unknown>
let dataset: Doc[] = []

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown> = {}) =>
      (await evaluate(parse(query), { dataset, params })).get(),
  },
  clientWrite: {},
}))

const { getDomainVerification, listDomainVerificationsForConference } =
  await import('./sanity')

function verification(hostname: string, fields: Doc = {}): Doc {
  return {
    _id: `domainVerification.${hostname}`,
    _type: 'domainVerification',
    hostname,
    conference: { _type: 'reference', _ref: 'conference-1' },
    token: 'tok',
    status: 'verified',
    method: 'dns-txt',
    ...fields,
  }
}

beforeEach(() => {
  dataset = []
})

describe('the record fields every reader shares', () => {
  const stored = {
    method: 'grandfathered',
    graceUntil: '2026-11-01T00:00:00.000Z',
    verifiedAt: '2026-09-01T00:00:00.000Z',
    lastSuccessAt: '2026-10-08T05:00:00.000Z',
    lastCheckedAt: '2026-10-09T05:00:00.000Z',
    firstFailureAt: '2026-10-09T05:00:00.000Z',
    consecutiveFailures: 2,
    consecutiveSoftFailures: 3,
    lastError: 'NXDOMAIN',
  }
  const whole = {
    _id: 'domainVerification.a.example.org',
    hostname: 'a.example.org',
    conferenceId: 'conference-1',
    token: 'tok',
    status: 'verified',
    ...stored,
  }
  /** A record written before `status`, `method` and the counters existed. */
  const legacy = {
    _id: 'domainVerification.old.example.org',
    _rev: 'rev-old',
    _type: 'domainVerification',
    hostname: 'old.example.org',
    conference: { _type: 'reference', _ref: 'conference-1' },
    token: 'tok',
  }
  const legacyRead = {
    _id: 'domainVerification.old.example.org',
    hostname: 'old.example.org',
    conferenceId: 'conference-1',
    token: 'tok',
    status: 'pending',
    method: 'dns-txt',
    graceUntil: null,
    verifiedAt: null,
    lastSuccessAt: null,
    lastCheckedAt: null,
    firstFailureAt: null,
    consecutiveFailures: 0,
    consecutiveSoftFailures: 0,
    lastError: null,
  }

  it('still reads the whole record for everything else that reads one', async () => {
    dataset.push(verification('a.example.org', stored))
    dataset.push(legacy)

    expect(await getDomainVerification('a.example.org')).toEqual(whole)
    expect(await getDomainVerification('old.example.org')).toEqual(legacyRead)
  })
})

describe('listDomainVerificationsForConference', () => {
  it('returns only this conference’s records, including pending claims', async () => {
    dataset.push(
      verification('ours.example.org'),
      verification('pending.example.org', { status: 'pending' }),
      verification('theirs.example.org', {
        conference: { _type: 'reference', _ref: 'conference-2' },
        token: 'their-token',
      }),
    )
    const rows = await listDomainVerificationsForConference('conference-1')
    expect(
      rows.map(({ hostname, status, token }) => ({ hostname, status, token })),
    ).toEqual([
      { hostname: 'ours.example.org', status: 'verified', token: 'tok' },
      { hostname: 'pending.example.org', status: 'pending', token: 'tok' },
    ])
  })
})
