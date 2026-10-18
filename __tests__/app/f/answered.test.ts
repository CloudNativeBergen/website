/**
 * @vitest-environment node
 *
 * THE ANSWERED STATE AND DELETE MY ANSWER (speaker feedback spec §7.2, §7.4,
 * §14, F2): the cookie Submit sets, presented back to the PAGE, shows the
 * answer it recorded; presented to Delete my answer, it deletes that same
 * document and the next page load is the open form again.
 *
 * REAL: the page module, the Server Action module, the index's GROQ (run by
 * `groq-js`), the writes as the real `@sanity/client` builds them, applied by
 * `@sanity/mutator` (`versionedSanityStore`), and the cookie as Next's own
 * `ResponseCookies` serializes it (`nextHeadersJar`).
 * SUPPLIED: the conference serving the Host, `next/cache` (the directives are
 * no-ops, so every render reads afresh; `updateTag` is counted), and Next's
 * `connection()`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../helpers/versionedSanityStore'
import {
  beginRequest,
  presentCookie,
  writtenCookies,
} from '../../helpers/nextHeadersJar'

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  resolution: {} as Record<string, unknown>,
  updateTag: vi.fn(),
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})
vi.mock('next/headers', () => import('../../helpers/nextHeadersJar'))
vi.mock('next/cache', () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  updateTag: h.updateTag,
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => h.resolution,
}))

import {
  deleteFeedbackAnswer,
  submitFeedbackAnswer,
} from '@/app/(public)/f/[code]/actions'
import FeedbackCodePage from '@/app/(public)/f/[code]/page'
import { feedbackResponseTag } from '@/lib/cache/tags'

const store = () => h.store!
const ref = (id: string) => ({ _type: 'reference', _ref: id })

const CONF = {
  _id: 'conf-A',
  title: 'Conf A',
  endDate: '2026-10-27',
  programDate: '2026-08-01',
}
/** 10:30 in Oslo on 2026-10-26: talk-open's slot. */
const DURING = new Date('2026-10-26T09:30:00.000Z')
/** The day after: talk-open's window has closed. */
const AFTER = new Date('2026-10-27T12:00:00.000Z')

const talk = (id: string, conference: string, code: string) => ({
  _id: id,
  _type: 'talk',
  _rev: `rev-${id}`,
  conference: ref(conference),
  status: 'confirmed',
  title: `Title of ${id}`,
  feedbackCode: code,
})

const day = (
  id: string,
  conference: string,
  date: string,
  slots: [string, string, string][],
) => ({
  _id: id,
  _type: 'schedule',
  conference: ref(conference),
  date,
  status: 'official',
  tracks: [
    {
      _key: 't1',
      talks: slots.map(([talkId, startTime, endTime]) => ({
        _key: `${talkId}-${startTime}`,
        talk: ref(talkId),
        startTime,
        endTime,
      })),
    },
  ],
})

const responses = () =>
  store()
    .all()
    .filter((doc) => doc._type === 'feedbackResponse')

function cookieFromResponse(): string {
  const line = writtenCookies().at(-1)
  if (!line) throw new Error('no Set-Cookie was written')
  const [pair] = line.split(';')
  return pair.slice(pair.indexOf('=') + 1)
}

/** A new request; with `cookie`, as the browser sends it back on `/f`. */
function request(cookie?: string) {
  beginRequest()
  if (cookie !== undefined) presentCookie('konf_feedback', cookie)
}

/** The page's state, as the Server Component hands it to the client. */
async function pageState(code = 'k7m2qx') {
  const element = await FeedbackCodePage({
    params: Promise.resolve({ code }),
  })
  return element.props.page
}

/** Answer talk-open from a fresh phone and return its cookie. */
async function answered(colour = 'green', comment?: string) {
  request()
  const outcome = await submitFeedbackAnswer('k7m2qx', colour, comment)
  expect(outcome).toMatchObject({ state: 'answered' })
  return cookieFromResponse()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(DURING)
  h.resolution = { conference: CONF, status: 'resolved' }
  h.updateTag.mockReset()
  store().reset([
    talk('talk-open', 'conf-A', 'k7m2qx'),
    talk('talk-later', 'conf-A', 'abc234'),
    talk('talk-foreign', 'conf-B', 'zzz234'),
    day('day-1', 'conf-A', '2026-10-26', [
      ['talk-open', '10:00', '10:40'],
      ['talk-later', '16:00', '16:40'],
    ]),
    day('day-B', 'conf-B', '2026-10-26', [['talk-foreign', '10:00', '10:40']]),
  ])
  request()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a reload after a tap', () => {
  it('shows Answered with the colour and comment, read by id on the live client', async () => {
    const cookie = await answered('yellow', 'Loved the demo')
    const [{ _id }] = responses()

    request(cookie)
    store().reset(store().all()) // clear the logs, keep the documents
    expect(await pageState()).toEqual({
      state: 'answered',
      colour: 'yellow',
      comment: 'Loved the demo',
      talk: { title: 'Title of talk-open', speakers: [] },
    })
    expect(store().docReads).toEqual([_id])
    // By id through the doc endpoint only: no GROQ for the response.
    for (const read of store().reads) {
      expect(read.query).not.toContain('feedbackResponse')
    }
  })

  it('shows the open form, reading no response, when the cookie is not sent', async () => {
    await answered()
    request()
    store().reset(store().all())
    expect(await pageState()).toMatchObject({ state: 'open' })
    expect(store().docReads).toEqual([])
  })

  it('shows the open form when the cookie lists an answer that was never saved', async () => {
    const cookie = await answered()
    store().remove(responses()[0]._id)
    request(cookie)
    expect(await pageState()).toMatchObject({ state: 'open' })
  })

  it('tells the page the colour and comment only, never that it was hidden or flagged', async () => {
    const cookie = await answered('red', 'rude')
    const [first] = responses()
    store().put({
      ...first,
      hiddenAt: '2026-10-26T09:35:00.000Z',
      flaggedAt: '2026-10-26T09:34:00.000Z',
    })
    request(cookie)
    const page = await pageState()
    expect(Object.keys(page).sort()).toEqual([
      'colour',
      'comment',
      'state',
      'talk',
    ])
    expect(JSON.stringify(page)).not.toMatch(/hidden|flagged|_id|_rev/)
  })

  it('reads no response for a talk the cookie does not list', async () => {
    const cookie = await answered()
    vi.setSystemTime(new Date('2026-10-26T15:10:00.000Z'))
    request(cookie)
    store().reset(store().all())
    expect(await pageState('abc234')).toMatchObject({ state: 'open' })
    expect(store().docReads).toEqual([])
  })

  it('offers Delete on Closed when the cookie lists the talk, without a read', async () => {
    const cookie = await answered()
    vi.setSystemTime(AFTER)
    request(cookie)
    store().reset(store().all())
    expect(await pageState()).toEqual({
      state: 'closed',
      talk: { title: 'Title of talk-open', speakers: [] },
      canDelete: true,
    })
    expect(store().docReads).toEqual([])

    request()
    expect(await pageState()).toMatchObject({ canDelete: false })
  })

  it('offers Delete on Not yet open when the answered talk moved to later', async () => {
    const cookie = await answered()
    // The talk moved to the afternoon: the window is not open now.
    store().put(
      day('day-1', 'conf-A', '2026-10-26', [
        ['talk-open', '16:00', '16:40'],
        ['talk-later', '16:00', '16:40'],
      ]),
    )
    request(cookie)
    expect(await pageState()).toMatchObject({
      state: 'not-yet-open',
      canDelete: true,
    })
    request()
    expect(await pageState()).toMatchObject({
      state: 'not-yet-open',
      canDelete: false,
    })
  })
})

describe('Delete my answer', () => {
  it('deletes this device’s response, drops the talk from the cookie, and shows the open form', async () => {
    const cookie = await answered('green', 'hi')
    const [{ _id }] = responses()
    h.updateTag.mockReset() // Submit expired it too; count Delete's own call.

    request(cookie)
    expect(await deleteFeedbackAnswer('k7m2qx')).toEqual({
      state: 'open',
      talk: { title: 'Title of talk-open', speakers: [] },
      closesAt: '2026-10-27T09:40:00.000Z',
    })
    expect(responses()).toEqual([])
    expect(store().commits.at(-1)).toEqual([{ delete: { id: _id } }])
    expect(h.updateTag).toHaveBeenCalledWith(feedbackResponseTag(_id))

    // The cookie no longer lists the talk: a reload is the open form, and a
    // second Delete has nothing to delete.
    const after = cookieFromResponse()
    expect(after).not.toBe(cookie)
    request(after)
    expect(await pageState()).toMatchObject({ state: 'open' })
    const commits = store().commits.length
    request(after)
    await deleteFeedbackAnswer('k7m2qx')
    expect(store().commits).toHaveLength(commits)
  })

  it('keeps the token: the next tap lands on the same id as before', async () => {
    const cookie = await answered()
    const [{ _id }] = responses()
    request(cookie)
    await deleteFeedbackAnswer('k7m2qx')
    request(cookieFromResponse())
    await submitFeedbackAnswer('k7m2qx', 'red')
    expect(responses().map((r) => r._id)).toEqual([_id])
  })

  it('sets the cookie with the same attributes as Submit', async () => {
    const cookie = await answered()
    request(cookie)
    await deleteFeedbackAnswer('k7m2qx')
    const lines = writtenCookies()
    expect(lines).toHaveLength(1)
    const [pair, ...attributes] = lines[0].split('; ')
    expect(pair).toMatch(/^konf_feedback=[\w-]+\.[\w-]+$/)
    expect(attributes.sort()).toEqual(
      [
        'Expires=Wed, 25 Nov 2026 09:30:00 GMT',
        'HttpOnly',
        'Max-Age=2592000',
        'Path=/f',
        'SameSite=lax',
        'Secure',
      ].sort(),
    )
  })

  it('works after the window has closed (R1), showing Closed without Delete', async () => {
    const cookie = await answered()
    vi.setSystemTime(AFTER)
    request(cookie)
    expect(await deleteFeedbackAnswer('k7m2qx')).toEqual({
      state: 'closed',
      talk: { title: 'Title of talk-open', speakers: [] },
      canDelete: false,
    })
    expect(responses()).toEqual([])
  })

  it('works before the window opens again, after the talk moved', async () => {
    const cookie = await answered()
    store().put(
      day('day-1', 'conf-A', '2026-10-26', [['talk-open', '16:00', '16:40']]),
    )
    request(cookie)
    expect(await deleteFeedbackAnswer('k7m2qx')).toMatchObject({
      state: 'not-yet-open',
      canDelete: false,
    })
    expect(responses()).toEqual([])
  })

  it('deletes only the answer about THIS talk', async () => {
    let cookie = await answered()
    vi.setSystemTime(new Date('2026-10-26T15:10:00.000Z'))
    request(cookie)
    await submitFeedbackAnswer('abc234', 'red')
    cookie = cookieFromResponse()
    request(cookie)
    await deleteFeedbackAnswer('abc234')
    expect(responses().map((r) => (r.talk as { _ref: string })._ref)).toEqual([
      'talk-open',
    ])
    // The other answer is still this device's.
    request(cookieFromResponse())
    expect(await pageState('k7m2qx')).toMatchObject({ state: 'answered' })
  })

  it('is Unavailable when the delete failed, and the cookie still lists the talk', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cookie = await answered()
    h.updateTag.mockReset()
    request(cookie)
    store().failWrites(new Error('503: write refused'))
    expect(await deleteFeedbackAnswer('k7m2qx')).toEqual({
      state: 'unavailable',
    })
    expect(responses()).toHaveLength(1)
    expect(writtenCookies()).toEqual([])
    expect(h.updateTag).not.toHaveBeenCalled()
  })
})

describe('Delete my answer refuses, before any write or talk-specific read', () => {
  const nothingHappened = () => {
    expect(store().commits).toHaveLength(0)
    expect(store().docReads).toEqual([])
    expect(writtenCookies()).toEqual([])
    expect(h.updateTag).not.toHaveBeenCalled()
  }

  it('treats another tenant’s code exactly like one that does not exist, whatever the cookie', async () => {
    const cookie = await answered()
    store().reset(store().all())
    h.updateTag.mockReset()
    request(cookie)
    const foreign = await deleteFeedbackAnswer('zzz234')
    const never = await deleteFeedbackAnswer('nnnn23')
    expect(foreign).toEqual({ state: 'unknown' })
    expect(foreign).toEqual(never)
    nothingHappened()
    for (const read of store().reads) {
      expect(JSON.stringify(read)).not.toContain('zzz234')
    }
  })

  it('deletes nothing without a cookie, with a forged one, or for a talk the cookie does not list', async () => {
    const cookie = await answered()
    const [payload, signature] = cookie.split('.')
    const forged = JSON.parse(Buffer.from(payload, 'base64url').toString())
    forged.l.push('AAAAAAAAAAA')
    const reSigned = `${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${signature}`
    store().reset(store().all())
    h.updateTag.mockReset()

    for (const sent of [undefined, reSigned]) {
      request(sent)
      expect(await deleteFeedbackAnswer('k7m2qx')).toEqual({
        state: 'open',
        talk: { title: 'Title of talk-open', speakers: [] },
        closesAt: '2026-10-27T09:40:00.000Z',
      })
    }
    vi.setSystemTime(new Date('2026-10-26T15:10:00.000Z'))
    request(cookie)
    expect(await deleteFeedbackAnswer('abc234')).toMatchObject({
      state: 'open',
    })
    nothingHappened()
    expect(responses()).toHaveLength(1)
  })

  it('is Unknown on a host no conference claims, and Unavailable when it could not be read', async () => {
    h.resolution = { conference: {}, status: 'not-found' }
    expect(await deleteFeedbackAnswer('k7m2qx')).toEqual({ state: 'unknown' })
    h.resolution = { conference: {}, status: 'unavailable' }
    expect(await deleteFeedbackAnswer('k7m2qx')).toEqual({
      state: 'unavailable',
    })
    expect(store().reads).toEqual([])
    nothingHappened()
  })
})

describe('a tap after the window closed', () => {
  it('shows Closed with Delete when the cookie lists the talk', async () => {
    const cookie = await answered()
    vi.setSystemTime(AFTER)
    request(cookie)
    expect(await submitFeedbackAnswer('k7m2qx', 'red')).toEqual({
      state: 'closed',
      talk: { title: 'Title of talk-open', speakers: [] },
      canDelete: true,
    })
    request()
    expect(await submitFeedbackAnswer('k7m2qx', 'red')).toMatchObject({
      canDelete: false,
    })
  })
})
