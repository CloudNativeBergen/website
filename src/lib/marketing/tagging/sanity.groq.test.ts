// @vitest-environment node
/**
 * The tagging reads (#1151) executed with groq-js against an in-memory
 * dataset, not a mock: they must return the VALUES the checks decide from,
 * and nothing of another conference.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: { fetch: (...a: unknown[]) => fetchMock(...a) },
}))

import {
  getConferenceTaggablePeople,
  getTaskTagPeople,
  getVariantMentionRecords,
  taggablePeopleFrom,
} from './sanity'

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const dataset = [
  {
    _id: 'spk-alice',
    _type: 'speaker',
    name: 'Alice',
    links: ['https://bsky.app/profile/Alice.Dev'],
  },
  {
    _id: 'spk-olga',
    _type: 'speaker',
    name: 'Olga',
    links: ['https://bsky.app/profile/olga.dev'],
    socialTagOptOut: true,
  },
  {
    _id: 'spk-mallory',
    _type: 'speaker',
    name: 'Mallory',
    links: ['https://bsky.app/profile/mallory.dev'],
  },
  {
    _id: 'talk-A',
    _type: 'talk',
    conference: ref('conf-A'),
    speakers: [ref('spk-olga'), ref('spk-alice')],
  },
  {
    _id: 'talk-B',
    _type: 'talk',
    conference: ref('conf-B'),
    speakers: [ref('spk-mallory')],
  },
  {
    _id: 'variant-A',
    _type: 'socialPostVariant',
    conference: ref('conf-A'),
    mentions: [
      {
        _key: 'spk-alice',
        _type: 'socialPostMention',
        handle: 'alice.dev',
        did: 'did:plc:alice',
        speaker: { ...ref('spk-alice'), _weak: true },
        name: 'Alice',
        status: 'tagged',
      },
      { _key: 'broken', _type: 'socialPostMention', status: 'tagged' },
    ],
  },
  {
    _id: 'variant-B',
    _type: 'socialPostVariant',
    conference: ref('conf-B'),
    mentions: [
      {
        _key: 'spk-mallory',
        handle: 'mallory.dev',
        speaker: ref('spk-mallory'),
        name: 'Mallory',
        status: 'tagged',
      },
    ],
  },
  {
    _id: 'task-talk',
    _type: 'marketingTask',
    conference: ref('conf-A'),
    kind: 'publishing',
    channel: 'bluesky',
    subject: ref('talk-A'),
  },
  {
    _id: 'task-linkedin',
    _type: 'marketingTask',
    conference: ref('conf-A'),
    kind: 'publishing',
    channel: 'linkedin',
    subject: ref('talk-A'),
  },
  // A subject hand-pointed at another conference's talk and speaker.
  {
    _id: 'task-foreign-talk',
    _type: 'marketingTask',
    conference: ref('conf-A'),
    kind: 'publishing',
    channel: 'bluesky',
    subject: ref('talk-B'),
  },
  {
    _id: 'task-foreign-speaker',
    _type: 'marketingTask',
    conference: ref('conf-A'),
    kind: 'publishing',
    channel: 'bluesky',
    subject: ref('spk-mallory'),
  },
  {
    _id: 'task-speaker',
    _type: 'marketingTask',
    conference: ref('conf-A'),
    kind: 'publishing',
    channel: 'bluesky',
    subject: ref('spk-alice'),
  },
]

beforeEach(() => {
  fetchMock.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) =>
      await (await evaluate(parse(query), { dataset, params })).get(),
  )
})

const alice = {
  speakerId: 'spk-alice',
  name: 'Alice',
  handle: 'alice.dev',
  optedOut: false,
}
const olga = {
  speakerId: 'spk-olga',
  name: 'Olga',
  handle: 'olga.dev',
  optedOut: true,
}

describe('getConferenceTaggablePeople', () => {
  it('reads this conference’s speakers with handle and opt-out, no one else', async () => {
    expect(await getConferenceTaggablePeople('conf-A')).toEqual([olga, alice])
  })
})

describe('getVariantMentionRecords', () => {
  it('reads the whole records back, dropping a malformed row', async () => {
    expect(await getVariantMentionRecords('variant-A', 'conf-A')).toEqual([
      {
        _key: 'spk-alice',
        handle: 'alice.dev',
        did: 'did:plc:alice',
        speakerId: 'spk-alice',
        name: 'Alice',
        status: 'tagged',
      },
    ])
  })

  it('reads nothing of another conference’s variant', async () => {
    expect(await getVariantMentionRecords('variant-B', 'conf-A')).toEqual([])
    expect(
      (await getVariantMentionRecords('variant-B', 'conf-B')).map(
        (m) => m.handle,
      ),
    ).toEqual(['mallory.dev'])
  })
})

describe('getTaskTagPeople', () => {
  it('a talk Task: the talk’s speakers in its order', async () => {
    expect(await getTaskTagPeople('task-talk', 'conf-A')).toEqual([olga, alice])
  })

  it('a speaker Task: that speaker', async () => {
    expect(await getTaskTagPeople('task-speaker', 'conf-A')).toEqual([alice])
  })

  it('a speaker Task whose only talk here is a draft: nobody', async () => {
    dataset.push(
      {
        _id: 'drafts.talk-M',
        _type: 'talk',
        conference: ref('conf-A'),
        speakers: [ref('spk-mallory')],
      },
      {
        _id: 'versions.r1.talk-M',
        _type: 'talk',
        conference: ref('conf-A'),
        speakers: [ref('spk-mallory')],
      },
    )
    try {
      expect(await getTaskTagPeople('task-foreign-speaker', 'conf-A')).toEqual(
        [],
      )
    } finally {
      dataset.splice(-2, 2)
    }
  })

  it('a talk subject that is a draft or a release version: nobody', async () => {
    for (const id of ['drafts.talk-A', 'versions.r1.talk-A']) {
      dataset.push(
        { ...dataset.find((d) => d._id === 'talk-A')!, _id: id },
        {
          _id: `task-${id}`,
          _type: 'marketingTask',
          conference: ref('conf-A'),
          kind: 'publishing',
          channel: 'bluesky',
          subject: ref(id),
        },
      )
      try {
        expect(await getTaskTagPeople(`task-${id}`, 'conf-A')).toEqual([])
      } finally {
        dataset.splice(-2, 2)
      }
    }
  })

  it('a LinkedIn Task: nobody', async () => {
    expect(await getTaskTagPeople('task-linkedin', 'conf-A')).toEqual([])
  })

  it('a subject of another conference: nobody', async () => {
    expect(await getTaskTagPeople('task-foreign-talk', 'conf-A')).toEqual([])
    expect(await getTaskTagPeople('task-foreign-speaker', 'conf-A')).toEqual([])
  })

  it('a Task of another conference: nobody', async () => {
    expect(await getTaskTagPeople('task-talk', 'conf-B')).toEqual([])
  })
})

describe('taggablePeopleFrom', () => {
  it('for the browser, an opted-out speaker keeps no handle', () => {
    expect(
      taggablePeopleFrom(
        [
          {
            _id: 'spk-olga',
            name: 'Olga',
            links: ['https://bsky.app/profile/olga.dev'],
            socialTagOptOut: true,
          },
        ],
        { forClient: true },
      ),
    ).toEqual([{ ...olga, handle: null }])
  })
})
