// @vitest-environment node
/**
 * `getSpeakerTagSources` executed against an in-memory dataset with groq-js,
 * not a mock: it must return the VALUES generation decides a tag from (links,
 * the opt-out), and only for speakers with a talk at THIS conference.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: { fetch: (...a: unknown[]) => fetchMock(...a) },
}))

import {
  getSignedSponsorSubject,
  getSpeakerTagSources,
  getSponsorTagSources,
} from '../generation-sanity'

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const dataset: Record<string, unknown>[] = [
  {
    _id: 'spk-alice',
    _type: 'speaker',
    name: 'Alice',
    links: ['https://bsky.app/profile/alice.dev'],
    socialTagOptOut: true,
  },
  {
    _id: 'spk-bob',
    _type: 'speaker',
    name: 'Bob',
    links: ['https://bsky.app/profile/bob.dev'],
  },
  {
    _id: 'talk-A',
    _type: 'talk',
    conference: ref('conf-A'),
    speakers: [ref('spk-alice')],
  },
  // Bob speaks at ANOTHER conference only.
  {
    _id: 'talk-B',
    _type: 'talk',
    conference: ref('conf-B'),
    speakers: [ref('spk-bob')],
  },
  // Sponsors (#1154): `sponsor` is ORG-level, shared across editions.
  {
    _id: 'sp-acme',
    _type: 'sponsor',
    name: 'Acme AS',
    organization: ref('org-A'),
    blueskyHandle: 'acme.example',
  },
  {
    _id: 'sp-initech',
    _type: 'sponsor',
    name: 'Initech',
    organization: ref('org-A'),
    blueskyHandle: 'initech.example',
  },
  {
    _id: 'sfc-acme-A',
    _type: 'sponsorForConference',
    conference: ref('conf-A'),
    sponsor: ref('sp-acme'),
    contractStatus: 'contract-signed',
    tier: ref('tier-gold'),
  },
  { _id: 'tier-gold', _type: 'sponsorTier', title: 'Gold' },
  // Initech sponsors ANOTHER edition of the same organization only.
  {
    _id: 'sfc-initech-B',
    _type: 'sponsorForConference',
    conference: ref('conf-B'),
    sponsor: ref('sp-initech'),
    contractStatus: 'contract-signed',
  },
  // A second talk of Alice's at this conference: still one row.
  {
    _id: 'talk-A2',
    _type: 'talk',
    conference: ref('conf-A'),
    speakers: [ref('spk-alice'), ref('spk-bob-not-asked')],
  },
]

beforeEach(() => {
  fetchMock.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) =>
      await (await evaluate(parse(query), { dataset, params })).get(),
  )
})

describe('getSpeakerTagSources', () => {
  it('reads the links and the opt-out of the speakers asked for, once each', async () => {
    expect(await getSpeakerTagSources('conf-A', ['spk-alice'])).toEqual([
      {
        _id: 'spk-alice',
        links: ['https://bsky.app/profile/alice.dev'],
        socialTagOptOut: true,
      },
    ])
  })

  it('does not read a speaker who has no talk at this conference', async () => {
    expect(await getSpeakerTagSources('conf-A', ['spk-bob'])).toEqual([])
    expect(await getSpeakerTagSources('conf-B', ['spk-bob'])).toEqual([
      {
        _id: 'spk-bob',
        links: ['https://bsky.app/profile/bob.dev'],
        socialTagOptOut: null,
      },
    ])
  })
})

describe('getSponsorTagSources (#1154)', () => {
  it('reads the CRM handle of a sponsor of THIS conference', async () => {
    expect(await getSponsorTagSources('conf-A', ['sp-acme'])).toEqual([
      {
        _id: 'sp-acme',
        links: null,
        socialTagOptOut: null,
        blueskyHandle: 'acme.example',
      },
    ])
  })

  it('does not read a sponsor whose deal here is not signed', async () => {
    dataset.push({
      _id: 'sfc-initech-A',
      _type: 'sponsorForConference',
      conference: ref('conf-A'),
      sponsor: ref('sp-initech'),
      status: 'closed-lost',
    })
    try {
      expect(await getSponsorTagSources('conf-A', ['sp-initech'])).toEqual([])
    } finally {
      dataset.pop()
    }
  })

  it('does not read a lost deal that keeps contractStatus as history', async () => {
    dataset.push({
      _id: 'sfc-initech-A',
      _type: 'sponsorForConference',
      conference: ref('conf-A'),
      sponsor: ref('sp-initech'),
      contractStatus: 'contract-signed',
      status: 'closed-lost',
    })
    try {
      expect(await getSponsorTagSources('conf-A', ['sp-initech'])).toEqual([])
    } finally {
      dataset.pop()
    }
  })

  it('does not read a sponsor of another edition, though the org owns both', async () => {
    expect(await getSponsorTagSources('conf-A', ['sp-initech'])).toEqual([])
  })
})

describe('getSignedSponsorSubject (#1154)', () => {
  it('names the company as the one person a tagging body tags', async () => {
    expect(await getSignedSponsorSubject('conf-A', 'sfc-acme-A')).toEqual({
      _id: 'sp-acme',
      type: 'sponsor',
      values: { name: 'Acme AS', company: 'Acme AS', tier: 'Gold' },
      people: [{ _id: 'sp-acme', name: 'Acme AS', sponsor: true }],
    })
  })
})
