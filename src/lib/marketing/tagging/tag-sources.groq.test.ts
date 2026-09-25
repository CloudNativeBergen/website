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

import { getSpeakerTagSources } from '../generation-sanity'

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const dataset = [
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
