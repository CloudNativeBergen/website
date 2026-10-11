import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parse, evaluate } from 'groq-js'

/**
 * `getDomainClaim` against the real thing it depends on: the query is EXECUTED
 * (groq-js) over a dataset. Every other suite of the destination check mocks
 * this read, so this is the only place a wrong field name in its projection
 * can be seen. Only the network is absent.
 */

type Doc = Record<string, unknown>

let dataset: Doc[] = []

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown> = {}) =>
      (await evaluate(parse(query), { dataset, params })).get(),
  },
  clientWrite: {},
}))

const { getDomainClaim } = await import('./sanity')

const HOST = 'conf.example.org'

function verification(fields: Doc = {}): Doc {
  return {
    _id: `domainVerification.${HOST}`,
    _type: 'domainVerification',
    hostname: HOST,
    conference: { _type: 'reference', _ref: 'conference-1' },
    token: 'tok',
    status: 'verified',
    method: 'dns-txt',
    lastSuccessAt: '2026-10-09T12:00:00.000Z',
    ...fields,
  }
}

beforeEach(() => {
  dataset = [
    verification(),
    {
      _id: 'conference-1',
      _type: 'conference',
      organization: { _type: 'reference', _ref: 'org-1' },
      ticketingProvider: 'tito',
      domains: [HOST, 'second.example.org'],
      title: 'Not read',
    },
    // Another host's record, pointing at another conference.
    {
      ...verification(),
      _id: 'domainVerification.other.example.org',
      hostname: 'other.example.org',
      conference: { _type: 'reference', _ref: 'conference-2' },
    },
    {
      _id: 'conference-2',
      _type: 'conference',
      organization: { _type: 'reference', _ref: 'org-2' },
      domains: ['other.example.org'],
    },
  ]
})

describe('getDomainClaim', () => {
  it('reads the record with the conference it points at: who it is, its owner, its vendor and every domain it claims', async () => {
    expect(await getDomainClaim(`domainVerification.${HOST}`)).toEqual({
      record: {
        _id: `domainVerification.${HOST}`,
        hostname: HOST,
        conferenceId: 'conference-1',
        token: 'tok',
        status: 'verified',
        method: 'dns-txt',
        graceUntil: null,
        verifiedAt: null,
        lastSuccessAt: '2026-10-09T12:00:00.000Z',
        lastCheckedAt: null,
        firstFailureAt: null,
        consecutiveFailures: 0,
        consecutiveSoftFailures: 0,
        lastError: null,
      },
      conference: {
        _id: 'conference-1',
        organization: { _type: 'reference', _ref: 'org-1' },
        ticketingProvider: 'tito',
        domains: [HOST, 'second.example.org'],
      },
    })
  })

  it('reads exactly the record asked for', async () => {
    const claim = await getDomainClaim('domainVerification.other.example.org')

    expect(claim?.record.hostname).toBe('other.example.org')
    expect(claim?.conference?._id).toBe('conference-2')
  })

  it('answers a null conference when the one it points at is gone', async () => {
    dataset = [verification({ conference: { _ref: 'conference-deleted' } })]

    const claim = await getDomainClaim(`domainVerification.${HOST}`)

    expect(claim?.record.conferenceId).toBe('conference-deleted')
    expect(claim?.conference).toBeNull()
  })

  it('answers null for an id with no record', async () => {
    expect(
      await getDomainClaim('domainVerification.nobody.example.org'),
    ).toBeNull()
  })
})
