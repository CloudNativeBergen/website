/**
 * @vitest-environment node
 *
 * SUBMIT on the attendee page (speaker feedback spec §7.3, §7.4, §14).
 *
 * REAL: the Server Action module, the code index's GROQ (run by `groq-js`),
 * the write as the real `@sanity/client` builds it, applied by
 * `@sanity/mutator` (`versionedSanityStore`), and the cookie as Next's own
 * `ResponseCookies` serializes it (`nextHeadersJar`). The `Set-Cookie` value
 * one call writes is presented to the next, as a browser would.
 * SUPPLIED: the conference serving the Host, and `next/cache` (the index's
 * cache directives are no-ops here, so every call reads the index afresh).
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
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => h.resolution,
}))

import { submitFeedbackAnswer } from '@/app/(public)/f/[code]/actions'
import { feedbackResponseTag } from '@/lib/cache/tags'
import { SUBMIT_COMMIT_BUDGET_MS } from '@/lib/feedback/bounds'

const store = () => h.store!
const ref = (id: string) => ({ _type: 'reference', _ref: id })

const CONF = {
  _id: 'conf-A',
  title: 'Conf A',
  endDate: '2026-10-27',
  programDate: '2026-08-01',
}
/** 10:30 in Oslo on 2026-10-26. */
const DURING = new Date('2026-10-26T09:30:00.000Z')

const talk = (id: string, conference: string, code: string) => ({
  _id: id,
  _type: 'talk',
  _rev: `rev-${id}`,
  conference: ref(conference),
  status: 'confirmed',
  title: `Title of ${id}`,
  feedbackCode: code,
  speakers: [{ ...ref('sp-live'), _key: 'k1' }],
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

/** The `name=value` part of the last `Set-Cookie`, as a browser keeps it. */
function deviceCookieFromResponse(): string {
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(DURING)
  h.resolution = { conference: CONF, status: 'resolved' }
  h.updateTag.mockReset()
  store().reset([
    { _id: 'sp-live', _type: 'speaker', _rev: 'rev-sp', name: 'Live' },
    talk('talk-open', 'conf-A', 'k7m2qx'),
    talk('talk-later', 'conf-A', 'abc234'),
    talk('talk-done', 'conf-A', 'def567'),
    talk('talk-foreign', 'conf-B', 'zzz234'),
    day('day-0', 'conf-A', '2026-10-24', [['talk-done', '10:00', '10:40']]),
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
  // A spy on the shared client must not outlive its test (#1438).
  vi.restoreAllMocks()
})

describe('the first tap', () => {
  it('records the colour on a new response about the talk', async () => {
    expect(await submitFeedbackAnswer('k7m2qx', 'green')).toEqual({
      state: 'answered',
      colour: 'green',
      comment: null,
      // The talk is public, so the thank-you keeps its heading.
      talk: { title: 'Title of talk-open', speakers: ['Live'] },
    })

    const [response] = responses()
    expect(responses()).toHaveLength(1)
    expect(response).toMatchObject({
      _type: 'feedbackResponse',
      talk: { _ref: 'talk-open' },
      conference: { _ref: 'conf-A' },
      colour: 'green',
      submittedAt: DURING.toISOString(),
    })
    expect(response._id).toMatch(/^feedbackResponse-[0-9a-f]{32}$/)
    // Nothing that identifies the attendee is stored.
    expect(
      Object.keys(response)
        .filter((key) => !key.startsWith('_'))
        .sort(),
    ).toEqual(['colour', 'conference', 'submittedAt', 'talk'])
  })

  it('sets the device cookie: httpOnly, SameSite=Lax, Path=/f, host-only, 30 days', async () => {
    await submitFeedbackAnswer('k7m2qx', 'green')

    const lines = writtenCookies()
    expect(lines).toHaveLength(1)
    const [pair, ...attributes] = lines[0].split('; ')
    expect(pair).toMatch(/^konf_feedback=[\w-]+\.[\w-]+$/)
    // No `Domain`: host-only.
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
})

describe('a second tap from the same phone', () => {
  it('changes the answer on the same response instead of adding one', async () => {
    await submitFeedbackAnswer('k7m2qx', 'green')
    const [first] = responses()
    const cookie = deviceCookieFromResponse()

    vi.setSystemTime(new Date(DURING.getTime() + 60_000))
    request(cookie)
    expect(await submitFeedbackAnswer('k7m2qx', 'red')).toMatchObject({
      state: 'answered',
      colour: 'red',
    })

    expect(responses()).toHaveLength(1)
    expect(responses()[0]).toMatchObject({
      _id: first._id,
      colour: 'red',
      submittedAt: '2026-10-26T09:31:00.000Z',
    })
    // The cookie is refreshed on every submit: same device, new time.
    expect(writtenCookies()).toHaveLength(1)
    expect(deviceCookieFromResponse()).not.toBe(cookie)
  })

  it('adds a response when the cookie is not sent back: the cookie is what ties the taps', async () => {
    await submitFeedbackAnswer('k7m2qx', 'green')
    request()
    await submitFeedbackAnswer('k7m2qx', 'red')
    expect(responses()).toHaveLength(2)
  })

  it('replaces a cookie this server did not sign, never trusting its token', async () => {
    await submitFeedbackAnswer('k7m2qx', 'green')
    const [payload, signature] = deviceCookieFromResponse().split('.')
    const forged = JSON.parse(Buffer.from(payload, 'base64url').toString())
    forged.at += 1
    request(
      `${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${signature}`,
    )

    await submitFeedbackAnswer('k7m2qx', 'red')

    expect(
      responses()
        .map((r) => r.colour)
        .sort(),
    ).toEqual(['green', 'red'])
  })

  it('never clears what organizers and speakers set on the response', async () => {
    await submitFeedbackAnswer('k7m2qx', 'green')
    const [first] = responses()
    store().put({
      ...first,
      hiddenAt: '2026-10-26T09:35:00.000Z',
      flaggedAt: '2026-10-26T09:34:00.000Z',
    })

    request(deviceCookieFromResponse())
    await submitFeedbackAnswer('k7m2qx', 'yellow')

    expect(responses()[0]).toMatchObject({
      colour: 'yellow',
      hiddenAt: '2026-10-26T09:35:00.000Z',
      flaggedAt: '2026-10-26T09:34:00.000Z',
    })
  })

  it('answers each talk on its own response, and the cookie lists both', async () => {
    vi.setSystemTime(new Date('2026-10-26T15:10:00.000Z'))
    await submitFeedbackAnswer('k7m2qx', 'green')
    request(deviceCookieFromResponse())
    await submitFeedbackAnswer('abc234', 'red')
    request(deviceCookieFromResponse())
    await submitFeedbackAnswer('k7m2qx', 'yellow')

    expect(
      responses()
        .map((r) => [(r.talk as { _ref: string })._ref, r.colour])
        .sort(),
    ).toEqual([
      ['talk-later', 'red'],
      ['talk-open', 'yellow'],
    ])
  })

  it('converges on one response when two first taps for a talk race', async () => {
    // The device answered another talk before, so both taps carry its token.
    vi.setSystemTime(new Date('2026-10-26T15:10:00.000Z'))
    await submitFeedbackAnswer('abc234', 'green')
    const cookie = deviceCookieFromResponse()

    // The second tap commits while the first is about to: the first then
    // finds the response already created.
    request(cookie)
    store().beforeNextCommit(() => submitFeedbackAnswer('k7m2qx', 'red'))
    expect(await submitFeedbackAnswer('k7m2qx', 'yellow')).toMatchObject({
      state: 'answered',
      colour: 'yellow',
    })

    const onOpen = responses().filter(
      (r) => (r.talk as { _ref: string })._ref === 'talk-open',
    )
    expect(onOpen).toHaveLength(1)
    // Last write wins.
    expect(onOpen[0].colour).toBe('yellow')
    expect(store().commits).toHaveLength(3)
  })
})

describe('the comment (F2)', () => {
  it('is stored trimmed with the colour, and comes back in the Answered state', async () => {
    expect(
      await submitFeedbackAnswer('k7m2qx', 'green', '  Great demo!\n'),
    ).toEqual({
      state: 'answered',
      colour: 'green',
      comment: 'Great demo!',
      talk: { title: 'Title of talk-open', speakers: ['Live'] },
    })
    expect(responses()[0]).toMatchObject({
      colour: 'green',
      comment: 'Great demo!',
    })
  })

  it('is unset, not stored empty, when sent blank', async () => {
    await submitFeedbackAnswer('k7m2qx', 'green', 'First thoughts')
    request(deviceCookieFromResponse())
    expect(
      await submitFeedbackAnswer('k7m2qx', 'green', '  \n '),
    ).toMatchObject({ state: 'answered', comment: null })
    expect(responses()).toHaveLength(1)
    expect(responses()[0]).not.toHaveProperty('comment')
  })

  it('is untouched by a tap that sends none (a bare colour change)', async () => {
    expect(await submitFeedbackAnswer('k7m2qx', 'red')).toMatchObject({
      state: 'answered',
      comment: null,
    })
    expect(responses()[0]).not.toHaveProperty('comment')

    request(deviceCookieFromResponse())
    await submitFeedbackAnswer('k7m2qx', 'green', 'Keep me')
    request(deviceCookieFromResponse())
    expect(await submitFeedbackAnswer('k7m2qx', 'yellow')).toMatchObject({
      state: 'answered',
      colour: 'yellow',
      comment: 'Keep me',
    })
    expect(responses()[0]).toMatchObject({
      colour: 'yellow',
      comment: 'Keep me',
    })
  })

  it('survives a stale tab’s colour change, which is told the comment that is stored', async () => {
    // Tab A and tab B hold the same cookie; B still shows "no comment".
    await submitFeedbackAnswer('k7m2qx', 'green')
    const cookie = deviceCookieFromResponse()
    request(cookie)
    await submitFeedbackAnswer('k7m2qx', 'green', 'Great demo') // tab A
    request(cookie)
    const stale = await submitFeedbackAnswer('k7m2qx', 'red') // tab B
    expect(stale).toEqual({
      state: 'answered',
      colour: 'red',
      comment: 'Great demo',
      talk: { title: 'Title of talk-open', speakers: ['Live'] },
    })
    expect(responses()).toHaveLength(1)
    expect(responses()[0]).toMatchObject({
      colour: 'red',
      comment: 'Great demo',
    })
  })

  it('is unset by an explicitly emptied box, sent as an empty string', async () => {
    await submitFeedbackAnswer('k7m2qx', 'green', 'Great demo')
    request(deviceCookieFromResponse())
    expect(await submitFeedbackAnswer('k7m2qx', 'green', '')).toMatchObject({
      comment: null,
    })
    expect(responses()[0]).not.toHaveProperty('comment')
  })

  it('takes 1,000 characters after trimming, and refuses 1,001 before any write', async () => {
    const ok = `${'x'.repeat(1000)}  `
    expect(await submitFeedbackAnswer('k7m2qx', 'green', ok)).toMatchObject({
      state: 'answered',
      comment: 'x'.repeat(1000),
    })
    request(deviceCookieFromResponse())
    const before = store().commits.length
    expect(
      await submitFeedbackAnswer('k7m2qx', 'green', 'y'.repeat(1001)),
    ).toMatchObject({ state: 'open' })
    expect(store().commits).toHaveLength(before)
    expect(responses()[0].comment).toBe('x'.repeat(1000))
  })

  it('refuses anything but a string, before any write', async () => {
    for (const comment of [null, 42, ['hi'], { text: 'hi' }]) {
      expect(
        await submitFeedbackAnswer(
          'k7m2qx',
          'green',
          comment as unknown as string,
        ),
      ).toMatchObject({ state: 'open' })
    }
    expect(store().commits).toHaveLength(0)
    expect(writtenCookies()).toEqual([])
  })

  it('never clears what organizers and speakers set when the comment is reworded', async () => {
    await submitFeedbackAnswer('k7m2qx', 'green', 'rude')
    const [first] = responses()
    store().put({ ...first, hiddenAt: '2026-10-26T09:35:00.000Z' })

    request(deviceCookieFromResponse())
    await submitFeedbackAnswer('k7m2qx', 'green', 'ruder')
    expect(responses()[0]).toMatchObject({
      comment: 'ruder',
      hiddenAt: '2026-10-26T09:35:00.000Z',
    })
  })

  it('is read back by id when the commit answers with no documents', async () => {
    await submitFeedbackAnswer('k7m2qx', 'green', 'Stays put')
    request(deviceCookieFromResponse())
    store().withholdReturnedDocuments()
    const [{ _id }] = responses()
    // A colour-only tap: nothing sent says what the comment is.
    expect(await submitFeedbackAnswer('k7m2qx', 'red')).toMatchObject({
      colour: 'red',
      comment: 'Stays put',
    })
    expect(store().docReads).toEqual([
      'talk-open',
      'sp-live',
      'talk-open',
      'sp-live',
      _id,
    ])
  })

  it('is unknown, not "none", when the read-back fails after a colour-only tap', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await submitFeedbackAnswer('k7m2qx', 'green', 'Stays put')
    request(deviceCookieFromResponse())
    store().withholdReturnedDocuments()
    const original = store().clients.clientWrite as {
      getDocument: (id: string) => Promise<unknown>
    }
    const real = original.getDocument
    vi.spyOn(original, 'getDocument').mockImplementation((id: string) =>
      id.startsWith('feedbackResponse-')
        ? Promise.reject(new Error('503: read refused'))
        : real(id),
    )
    const outcome = await submitFeedbackAnswer('k7m2qx', 'red')
    expect(outcome).toMatchObject({ state: 'answered', colour: 'red' })
    expect((outcome as { comment?: unknown }).comment).toBeUndefined()
    // What was sent is still authoritative when something WAS sent.
    request(deviceCookieFromResponse())
    expect(
      await submitFeedbackAnswer('k7m2qx', 'red', 'New text'),
    ).toMatchObject({ comment: 'New text' })
    expect(responses()[0]).toMatchObject({ comment: 'New text' })
  })

  it('expires the response’s own cache tag after the write, so a reload shows the new answer', async () => {
    await submitFeedbackAnswer('k7m2qx', 'green', 'hi')
    const [{ _id }] = responses()
    expect(h.updateTag).toHaveBeenCalledTimes(1)
    expect(h.updateTag).toHaveBeenCalledWith(feedbackResponseTag(_id))
  })
})

describe('refusals, before any write or talk read', () => {
  const nothingHappened = () => {
    expect(store().commits).toHaveLength(0)
    expect(store().docReads).toEqual([])
    expect(writtenCookies()).toEqual([])
    expect(h.updateTag).not.toHaveBeenCalled()
  }

  it('treats another tenant’s code exactly like one that does not exist', async () => {
    const foreign = await submitFeedbackAnswer('zzz234', 'green')
    const never = await submitFeedbackAnswer('nnnn23', 'green')
    expect(foreign).toEqual({ state: 'unknown' })
    expect(foreign).toEqual(never)
    nothingHappened()
    for (const read of store().reads) {
      expect(JSON.stringify(read)).not.toContain('zzz234')
    }
  })

  it('reads nothing for a malformed code', async () => {
    for (const code of ['', '../x', 'k7m2q!', 42, null]) {
      expect(await submitFeedbackAnswer(code as string, 'green')).toEqual({
        state: 'unknown',
      })
    }
    expect(store().reads).toEqual([])
    nothingHappened()
  })

  it('refuses before the session starts, with the Not yet open page', async () => {
    expect(await submitFeedbackAnswer('abc234', 'green')).toMatchObject({
      state: 'not-yet-open',
    })
    nothingHappened()
  })

  it('refuses once feedback has closed, with the Closed page', async () => {
    expect(await submitFeedbackAnswer('def567', 'green')).toMatchObject({
      state: 'closed',
    })
    nothingHappened()
  })

  it('records answers outside the window under `next dev` with FEEDBACK_DEV_OPEN_WINDOW=1', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('FEEDBACK_DEV_OPEN_WINDOW', '1')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // Before its session, and after its window closed.
      expect(await submitFeedbackAnswer('abc234', 'green')).toMatchObject({
        state: 'answered',
        colour: 'green',
      })
      expect(await submitFeedbackAnswer('def567', 'red')).toMatchObject({
        state: 'answered',
        colour: 'red',
      })
      expect(
        responses()
          .map((r) => (r.talk as { _ref: string })._ref)
          .sort(),
      ).toEqual(['talk-done', 'talk-later'])
    } finally {
      vi.unstubAllEnvs()
      vi.mocked(console.warn).mockRestore()
    }
  })

  it('refuses anything but exactly one colour', async () => {
    for (const colour of ['blue', '', ['green'], { colour: 'green' }, null]) {
      expect(
        await submitFeedbackAnswer('k7m2qx', colour as 'green'),
      ).toMatchObject({ state: 'open' })
    }
    nothingHappened()
  })

  it('is Unknown on a host no conference claims, reading nothing', async () => {
    h.resolution = { conference: {}, status: 'not-found' }
    expect(await submitFeedbackAnswer('k7m2qx', 'green')).toEqual({
      state: 'unknown',
    })
    expect(store().reads).toEqual([])
    nothingHappened()
  })

  it('is Unavailable when the conference could not be read', async () => {
    h.resolution = { conference: {}, status: 'unavailable' }
    expect(await submitFeedbackAnswer('k7m2qx', 'green')).toEqual({
      state: 'unavailable',
    })
    nothingHappened()
  })
})

describe('the talk is read again by id before the write', () => {
  /** The index still sees the talk as it was; the doc endpoint sees `now`. */
  function indexLagsBehind(change: Record<string, unknown>) {
    const before = store().doc('talk-open')!
    store().put({ ...before, ...change })
    store().readsLagFor('talk-open', before)
  }

  it('writes when the talk still holds the code', async () => {
    indexLagsBehind({ title: 'Renamed' })
    expect(await submitFeedbackAnswer('k7m2qx', 'green')).toMatchObject({
      state: 'answered',
    })
    expect(store().docReads).toEqual(['talk-open', 'sp-live'])
  })

  it.each([
    ['the code was rotated', { feedbackCode: 'ghj789' }],
    ['the code was unset (folded or erased)', { feedbackCode: undefined }],
    ['the talk was withdrawn', { status: 'withdrawn' }],
    ['the talk moved to another conference', { conference: ref('conf-B') }],
  ])('refuses as Unknown when %s', async (_, change) => {
    indexLagsBehind(change)
    expect(await submitFeedbackAnswer('k7m2qx', 'green')).toEqual({
      state: 'unknown',
    })
    expect(store().commits).toHaveLength(0)
    expect(writtenCookies()).toEqual([])
  })

  it.each([
    ['every speaker is erased', { erasedAt: '2026-10-20T00:00:00.000Z' }],
    ['the speaker document is gone', null],
  ])(
    'refuses as Unknown when no live speaker is left on the talk: %s',
    async (_, change) => {
      if (change) store().put({ ...store().doc('sp-live')!, ...change })
      else store().remove('sp-live')
      expect(await submitFeedbackAnswer('k7m2qx', 'green')).toEqual({
        state: 'unknown',
      })
      expect(store().commits).toHaveLength(0)
      expect(writtenCookies()).toEqual([])
    },
  )

  it('writes when one of several speakers is still live', async () => {
    store().put({ ...store().doc('sp-live')!, erasedAt: undefined })
    store().put({
      _id: 'sp-erased',
      _type: 'speaker',
      erasedAt: '2026-10-20T00:00:00.000Z',
    })
    store().put({
      ...store().doc('talk-open')!,
      speakers: [
        { ...ref('sp-erased'), _key: 'k0' },
        { ...ref('sp-live'), _key: 'k1' },
      ],
    })
    expect(await submitFeedbackAnswer('k7m2qx', 'green')).toMatchObject({
      state: 'answered',
    })
  })

  it('refuses as Unknown when the talk was deleted', async () => {
    const before = store().doc('talk-open')!
    store().remove('talk-open')
    store().readsLagFor('talk-open', before)
    expect(await submitFeedbackAnswer('k7m2qx', 'green')).toEqual({
      state: 'unknown',
    })
    expect(store().commits).toHaveLength(0)
  })
})

describe('a failed write', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('is Unavailable, and the retry from this phone lands on the same response', async () => {
    store().beforeNextCommit(() => {
      throw new Error('503: write refused')
    })
    expect(await submitFeedbackAnswer('k7m2qx', 'green')).toEqual({
      state: 'unavailable',
    })
    expect(responses()).toHaveLength(0)

    request(deviceCookieFromResponse())
    await submitFeedbackAnswer('k7m2qx', 'red')
    expect(responses().map((r) => r.colour)).toEqual(['red'])
  })

  it('never counts one phone twice when a commit was applied but its answer was lost', async () => {
    store().afterNextCommit(() => {
      throw new Error('socket hang up')
    })
    expect(await submitFeedbackAnswer('k7m2qx', 'green')).toEqual({
      state: 'unavailable',
    })
    // The write went through; the attendee could not know.
    expect(responses()).toHaveLength(1)

    request(deviceCookieFromResponse())
    await submitFeedbackAnswer('k7m2qx', 'green')
    expect(responses()).toHaveLength(1)
  })

  it('sets no cookie when the talk could not be read, before any write', async () => {
    const original = store().clients.clientWrite as {
      getDocument: (id: string) => Promise<unknown>
    }
    const spy = vi
      .spyOn(original, 'getDocument')
      .mockRejectedValueOnce(new Error('503: read refused'))
    expect(await submitFeedbackAnswer('k7m2qx', 'green')).toEqual({
      state: 'unavailable',
    })
    // Capped since #1438 (an abort signal); the read itself is unchanged.
    expect(spy).toHaveBeenCalledWith('talk-open', expect.anything())
    expect(store().commits).toHaveLength(0)
    expect(writtenCookies()).toEqual([])
  })
})

describe('Submit is bounded on its own (speaker feedback spec §12.3)', () => {
  // A spy left on the shared client by an earlier test would wrap itself
  // here, and its failure would read as the refusal under test.
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.restoreAllMocks())

  const writer = () =>
    store().clients.clientWrite as {
      getDocument: (id: string, options?: unknown) => Promise<unknown>
      getDocuments: (ids: string[], options?: unknown) => Promise<unknown>
      transaction: () => { commit: (options?: unknown) => Promise<unknown> }
    }

  it('caps its talk re-read, its speakers read and its commit with an abort signal each', async () => {
    const w = writer()
    const read = vi.spyOn(w, 'getDocument')
    const speakersRead = vi.spyOn(w, 'getDocuments')
    const transaction = w.transaction.bind(w)
    const commitOptions: unknown[] = []
    vi.spyOn(w, 'transaction').mockImplementation(() => {
      const tx = transaction()
      const commit = tx.commit.bind(tx)
      tx.commit = (options?: unknown) => {
        commitOptions.push(options)
        return commit(options)
      }
      return tx
    })

    await submitFeedbackAnswer('k7m2qx', 'green')

    expect(read).toHaveBeenCalledWith(
      'talk-open',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(speakersRead).toHaveBeenCalledWith(
      ['sp-live'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(commitOptions).toEqual([
      expect.objectContaining({
        returnDocuments: true,
        signal: expect.any(AbortSignal),
      }),
    ])
  })

  it('writes nothing when its read of the speakers took it past the budget', async () => {
    const w = writer()
    const getDocuments = w.getDocuments.bind(w)
    vi.spyOn(w, 'getDocuments').mockImplementation(async (ids, options) => {
      vi.setSystemTime(DURING.getTime() + SUBMIT_COMMIT_BUDGET_MS + 1)
      return getDocuments(ids, options)
    })

    expect(await submitFeedbackAnswer('k7m2qx', 'green')).toEqual({
      state: 'unavailable',
    })
    expect(store().commits).toEqual([])
  })

  it('writes nothing when its re-read of the talk took longer than the budget', async () => {
    const w = writer()
    const getDocument = w.getDocument.bind(w)
    expect(vi.isMockFunction(w.getDocument)).toBe(false)
    vi.spyOn(w, 'getDocument').mockImplementation(async (id, options) => {
      // The re-read stalls past the budget before it answers.
      vi.setSystemTime(DURING.getTime() + SUBMIT_COMMIT_BUDGET_MS + 1)
      return getDocument(id, options)
    })

    const outcome = await submitFeedbackAnswer('k7m2qx', 'green')

    expect(outcome).toEqual({ state: 'unavailable' })
    expect(responses()).toEqual([])
    expect(store().commits).toEqual([])
  })
})
