/**
 * @vitest-environment node
 *
 * The attendee portal's ONE read of a conference's workshop announcements
 * (`getAnnouncementsByWorkshop`): one request for the whole page instead of
 * one per workshop card, through Sanity's CDN host.
 *
 * The query is EXECUTED (groq-js) over a dataset, so a misspelt field or a
 * missing tenant predicate fails here and not in production.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parse, evaluate } from 'groq-js'

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  /** Every read, with the client it went through. */
  reads: [] as Array<{ client: string; query: string }>,
}))

vi.mock('@/lib/sanity/client', () => {
  const client = (name: string) => ({
    fetch: async (query: string, params: Record<string, unknown> = {}) => {
      h.reads.push({ client: name, query })
      return (
        await evaluate(parse(query), { dataset: h.dataset, params })
      ).get()
    },
  })
  return {
    clientReadCached: client('cdn'),
    clientReadUncached: client('live'),
    clientWrite: client('write'),
  }
})

vi.mock('@/lib/email/workshop', () => ({
  sendWorkshopAnnouncementEmail: vi.fn(),
}))

import { getAnnouncementsByWorkshop } from './announcements'

const ref = (_ref: string) => ({ _type: 'reference', _ref })

function announcement(
  id: string,
  workshop: string,
  createdAt: string,
  conference = 'conf-1',
) {
  return {
    _id: id,
    _type: 'workshopAnnouncement',
    workshop: ref(workshop),
    conference: ref(conference),
    author: ref('speaker-ada'),
    body: `body of ${id}`,
    createdAt,
  }
}

beforeEach(() => {
  h.reads.length = 0
  h.dataset = [
    { _id: 'speaker-ada', _type: 'speaker', name: 'Ada Lovelace' },
    announcement('a1', 'ws-1', '2026-10-01T10:00:00Z'),
    announcement('a2', 'ws-1', '2026-10-03T10:00:00Z'),
    announcement('a3', 'ws-1', '2026-10-02T10:00:00Z'),
    announcement('b1', 'ws-2', '2026-10-02T12:00:00Z'),
    // Another tenant's, for a workshop id of its own and for one of ours.
    announcement('x1', 'ws-9', '2026-10-04T10:00:00Z', 'conf-2'),
    announcement('x2', 'ws-1', '2026-10-05T10:00:00Z', 'conf-2'),
    // Not an announcement at all.
    {
      _id: 'signup-1',
      _type: 'workshopSignup',
      workshop: ref('ws-1'),
      conference: ref('conf-1'),
    },
  ]
})

describe('getAnnouncementsByWorkshop', () => {
  it('groups the conference’s announcements by workshop, newest first, with the author’s name', async () => {
    expect(await getAnnouncementsByWorkshop('conf-1', 50)).toEqual({
      'ws-1': [
        {
          _id: 'a2',
          body: 'body of a2',
          createdAt: '2026-10-03T10:00:00Z',
          authorName: 'Ada Lovelace',
        },
        {
          _id: 'a3',
          body: 'body of a3',
          createdAt: '2026-10-02T10:00:00Z',
          authorName: 'Ada Lovelace',
        },
        {
          _id: 'a1',
          body: 'body of a1',
          createdAt: '2026-10-01T10:00:00Z',
          authorName: 'Ada Lovelace',
        },
      ],
      'ws-2': [
        {
          _id: 'b1',
          body: 'body of b1',
          createdAt: '2026-10-02T12:00:00Z',
          authorName: 'Ada Lovelace',
        },
      ],
    })
  })

  it('reads once, whatever the number of workshops, and through the CDN host', async () => {
    await getAnnouncementsByWorkshop('conf-1', 50)

    expect(h.reads.map((read) => read.client)).toEqual(['cdn'])
  })

  it('returns nothing of another conference, not even for a workshop id they share', async () => {
    const mine = await getAnnouncementsByWorkshop('conf-1', 50)
    const ids = Object.values(mine).flatMap((list) => list.map((a) => a._id))

    expect(ids.sort()).toEqual(['a1', 'a2', 'a3', 'b1'])
    expect(await getAnnouncementsByWorkshop('conf-2', 50)).toEqual({
      'ws-9': [expect.objectContaining({ _id: 'x1' })],
      'ws-1': [expect.objectContaining({ _id: 'x2' })],
    })
  })

  it('keeps the newest `limit` of each workshop', async () => {
    expect(await getAnnouncementsByWorkshop('conf-1', 2)).toEqual({
      'ws-1': [
        expect.objectContaining({ _id: 'a2' }),
        expect.objectContaining({ _id: 'a3' }),
      ],
      'ws-2': [expect.objectContaining({ _id: 'b1' })],
    })
  })

  it('is empty for a conference with no announcements', async () => {
    expect(await getAnnouncementsByWorkshop('conf-none', 50)).toEqual({})
  })

  it('refuses to read without a conference: never every tenant’s', async () => {
    await expect(getAnnouncementsByWorkshop('', 50)).rejects.toThrow(
      /empty tenant scope/,
    )
    expect(h.reads).toEqual([])
  })

  it('leaves out an announcement whose workshop reference is gone', async () => {
    h.dataset.push({
      _id: 'orphan',
      _type: 'workshopAnnouncement',
      conference: ref('conf-1'),
      body: 'no workshop',
      createdAt: '2026-10-06T10:00:00Z',
    })

    const mine = await getAnnouncementsByWorkshop('conf-1', 50)

    expect(Object.keys(mine).sort()).toEqual(['ws-1', 'ws-2'])
  })
})
