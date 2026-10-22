/**
 * @vitest-environment node
 *
 * The attendee page's read side (speaker feedback spec §5.1, §7.2): the
 * per-conference code index and what a scanned code resolves to. The index
 * query is EXECUTED with groq-js against a two-tenant fixture, and every read
 * is counted, so "a malformed or foreign code costs no talk read" is asserted
 * on the reads that actually ran rather than on a mock's call shape.
 *
 * Adversarial fixture: a `drafts.` copy of a talk with a different title, a
 * release version holding a code of its own, an accepted (not confirmed) talk
 * with a code, another tenant's talk and schedule, and a draft schedule.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  reads: [] as { query: string; params: Record<string, unknown> }[],
  cacheLife: [] as unknown[],
  cacheTag: [] as unknown[],
}))

vi.mock('next/cache', () => ({
  cacheLife: (life: unknown) => h.cacheLife.push(life),
  cacheTag: (tag: unknown) => h.cacheTag.push(tag),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown> = {}) => {
      h.reads.push({ query, params })
      const value = await evaluate(parse(query), { dataset: h.dataset, params })
      return value.get()
    },
  },
}))

import {
  FEEDBACK_CODE_INDEX_LIFE,
  feedbackCodeForTalk,
  feedbackCodeIndex,
  resolveFeedbackTarget,
} from './attendee'
import { feedbackCodeIndexTag } from '@/lib/cache/tags'

const ref = (id: string) => ({ _type: 'reference', _ref: id })

/** The page a code resolves to: what `/f/<code>` shows before the cookie. */
const pageFor = async (...args: Parameters<typeof resolveFeedbackTarget>) =>
  (await resolveFeedbackTarget(...args)).page

const talk = (
  id: string,
  conference: string,
  fields: Record<string, unknown>,
) => ({
  _id: id,
  _type: 'talk',
  conference: ref(conference),
  status: 'confirmed',
  title: `Title of ${id}`,
  speakers: [{ _key: 's1', ...ref('spk-ada') }],
  ...fields,
})

const day = (
  id: string,
  conference: string,
  date: string,
  status: string | undefined,
  talks: unknown[],
) => ({
  _id: id,
  _type: 'schedule',
  conference: ref(conference),
  date,
  ...(status && { status }),
  tracks: [
    {
      _key: 'track-1',
      trackTitle: 'Main',
      talks: [
        { _key: 'ph', placeholder: 'Lunch', startTime: '12:00' },
        ...talks,
      ],
    },
  ],
})

const slot = (talkId: string, startTime: string, endTime: string) => ({
  _key: `${talkId}-${startTime}`,
  talk: ref(talkId),
  startTime,
  endTime,
})

const CONF = {
  _id: 'conf-A',
  endDate: '2026-10-27',
  programDate: '2026-08-01',
}

/** 10:30 in Oslo on the first day (CET, UTC+1, after the DST change). */
const DURING = new Date('2026-10-26T09:30:00.000Z')

beforeEach(() => {
  h.reads = []
  h.cacheLife = []
  h.cacheTag = []
  h.dataset = [
    { _id: 'spk-ada', _type: 'speaker', name: 'Ada Lovelace' },
    { _id: 'spk-bob', _type: 'speaker', name: 'Bob Builder' },
    talk('talk-open', 'conf-A', {
      feedbackCode: 'k7m2qx',
      title: 'Kubernetes for everyone',
      speakers: [
        { _key: 's1', ...ref('spk-ada') },
        { _key: 's2', ...ref('spk-bob') },
        // A reference to a speaker document that no longer exists: it
        // dereferences to null and must not reach the page as "null".
        { _key: 's3', ...ref('spk-gone') },
      ],
    }),
    // A draft copy of the same talk: same code, different title. Must count
    // neither as a second holder of the code nor as the title.
    talk('drafts.talk-open', 'conf-A', {
      feedbackCode: 'k7m2qx',
      title: 'DRAFT TITLE',
    }),
    day('day-1', 'conf-A', '2026-10-26', 'official', [
      slot('talk-open', '10:00', '10:40'),
    ]),
  ]
})

describe('resolveFeedbackTarget().page', () => {
  it('shows an open, public talk as Open with its title and speakers', async () => {
    const page = await pageFor(CONF, 'k7m2qx', DURING)

    expect(page).toEqual({
      state: 'open',
      talk: {
        title: 'Kubernetes for everyone',
        speakers: ['Ada Lovelace', 'Bob Builder'],
      },
      // 24 hours after the slot's end, 10:40 Oslo = 09:40Z.
      closesAt: '2026-10-27T09:40:00.000Z',
    })
  })
})

describe('resolveFeedbackTarget().page — Unknown reveals nothing', () => {
  it('answers a malformed code with Unknown and NO read', async () => {
    for (const raw of ['', 'k7m2q', 'k7m2qxx', 'k7m2q0', '../x', 'K7M2Q!']) {
      expect(await pageFor(CONF, raw, DURING)).toEqual({
        state: 'unknown',
      })
    }
    expect(h.reads).toHaveLength(0)
  })

  it('accepts the code in any case, as the minter and index normalize', async () => {
    const page = await pageFor(CONF, 'K7M2QX', DURING)
    expect(page.state).toBe('open')
  })

  it('renders another tenant’s code exactly like a code that does not exist, reading only this conference', async () => {
    h.dataset.push(
      talk('talk-foreign', 'conf-B', { feedbackCode: 'zzz234' }),
      day('day-B', 'conf-B', '2026-10-26', 'official', [
        slot('talk-foreign', '10:00', '10:40'),
      ]),
    )
    const foreign = await pageFor(CONF, 'zzz234', DURING)
    const never = await pageFor(CONF, 'nnnn23', DURING)

    expect(foreign).toEqual({ state: 'unknown' })
    expect(foreign).toEqual(never)
    // Guard before fetch: no read names the foreign talk, and every read is
    // scoped to the serving conference.
    for (const read of h.reads) {
      expect(read.params.conferenceId).toBe('conf-A')
      expect(JSON.stringify(read)).not.toContain('talk-foreign')
      expect(JSON.stringify(read)).not.toContain('zzz234')
    }
    // And the foreign talk resolves on its own conference: the fixture is live.
    expect(
      (await pageFor({ ...CONF, _id: 'conf-B' }, 'zzz234', DURING)).state,
    ).toBe('open')
  })

  it('is Unknown for a talk that is not confirmed', async () => {
    h.dataset.push(
      talk('talk-accepted', 'conf-A', {
        status: 'accepted',
        feedbackCode: 'abc234',
      }),
    )
    expect(await pageFor(CONF, 'abc234', DURING)).toEqual({
      state: 'unknown',
    })
  })

  it('is Unknown for a code held only by a draft or a release version', async () => {
    h.dataset.push(
      talk('drafts.talk-new', 'conf-A', { feedbackCode: 'drft23' }),
      talk('versions.rel1.talk-new', 'conf-A', { feedbackCode: 'vers23' }),
    )
    expect((await pageFor(CONF, 'drft23', DURING)).state).toBe('unknown')
    expect((await pageFor(CONF, 'vers23', DURING)).state).toBe('unknown')
  })

  it('resolves a code two published talks hold to neither', async () => {
    h.dataset.push(talk('talk-dup', 'conf-A', { feedbackCode: 'k7m2qx' }))
    expect(await pageFor(CONF, 'k7m2qx', DURING)).toEqual({
      state: 'unknown',
    })
  })
})

describe('resolveFeedbackTarget().page — "public" is computed per request', () => {
  it('hides the title and speakers before the program is published', async () => {
    const page = await pageFor(
      { ...CONF, programDate: '2026-10-27' },
      'k7m2qx',
      DURING,
    )
    // The closing time gives the slot's end away, so it goes too.
    expect(page).toEqual({ state: 'open', talk: null, closesAt: null })
  })

  it('hides them when there is no program date at all', async () => {
    const page = await pageFor({ ...CONF, programDate: null }, 'k7m2qx', DURING)
    expect(page.state).toBe('open')
    expect(page).toHaveProperty('talk', null)
  })

  it('shows a public talk before its session as Not yet open WITH its start time', async () => {
    const page = await pageFor(
      CONF,
      'k7m2qx',
      new Date('2026-10-26T08:00:00.000Z'),
    )
    expect(page).toEqual({
      state: 'not-yet-open',
      talk: {
        title: 'Kubernetes for everyone',
        speakers: ['Ada Lovelace', 'Bob Builder'],
      },
      opensAt: '2026-10-26T09:00:00.000Z',
    })
  })

  it('never gives the start time of a talk that is not public', async () => {
    const page = await pageFor(
      { ...CONF, programDate: '2026-10-27' },
      'k7m2qx',
      new Date('2026-10-26T08:00:00.000Z'),
    )
    expect(page).toEqual({ state: 'not-yet-open', talk: null, opensAt: null })
  })

  it('treats a talk only on a DRAFT schedule as unscheduled, and so not public', async () => {
    h.dataset = h.dataset.filter((d) => d._id !== 'day-1')
    h.dataset.push(
      day('day-draft', 'conf-A', '2026-10-26', 'draft', [
        slot('talk-open', '10:00', '10:40'),
      ]),
      day('drafts.day-1', 'conf-A', '2026-10-26', 'official', [
        slot('talk-open', '10:00', '10:40'),
      ]),
    )
    expect(await pageFor(CONF, 'k7m2qx', DURING)).toEqual({
      state: 'not-yet-open',
      talk: null,
      opensAt: null,
    })
  })

  it('counts a legacy schedule day with no status as official', async () => {
    h.dataset = h.dataset.filter((d) => d._id !== 'day-1')
    h.dataset.push(
      day('day-legacy', 'conf-A', '2026-10-26', undefined, [
        slot('talk-open', '10:00', '10:40'),
      ]),
    )
    expect((await pageFor(CONF, 'k7m2qx', DURING)).state).toBe('open')
  })

  it('is Closed 24 hours after the last slot ends, across days', async () => {
    h.dataset.push(
      day('day-2', 'conf-A', '2026-10-27', 'official', [
        slot('talk-open', '15:00', '15:40'),
      ]),
    )
    // One window from the EARLIEST start to 24 h after the LATEST end:
    // before the first slot it is not yet open, during it already open.
    expect(
      await pageFor(CONF, 'k7m2qx', new Date('2026-10-26T08:00:00.000Z')),
    ).toMatchObject({
      state: 'not-yet-open',
      opensAt: '2026-10-26T09:00:00.000Z',
    })
    expect(await pageFor(CONF, 'k7m2qx', DURING)).toMatchObject({
      state: 'open',
      closesAt: '2026-10-28T14:40:00.000Z',
    })
    const later = await pageFor(
      CONF,
      'k7m2qx',
      new Date('2026-10-28T14:39:00.000Z'),
    )
    expect(later).toMatchObject({
      state: 'open',
      closesAt: '2026-10-28T14:40:00.000Z',
    })
    expect(
      await pageFor(CONF, 'k7m2qx', new Date('2026-10-28T14:40:00.000Z')),
    ).toEqual({
      state: 'closed',
      talk: {
        title: 'Kubernetes for everyone',
        speakers: ['Ada Lovelace', 'Bob Builder'],
      },
    })
  })
})

describe('resolveFeedbackTarget().page — the local dev override', () => {
  /** Before the session: the real window is not yet open. */
  const BEFORE = new Date('2026-10-26T08:00:00.000Z')

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('opens every window under `next dev` with FEEDBACK_DEV_OPEN_WINDOW=1, and says so', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('FEEDBACK_DEV_OPEN_WINDOW', '1')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(await pageFor(CONF, 'k7m2qx', BEFORE)).toMatchObject({
      state: 'open',
      closesAt: '2026-10-27T09:40:00.000Z',
    })
    // After the real window closed, too.
    expect(
      await pageFor(CONF, 'k7m2qx', new Date('2026-11-01T00:00:00.000Z')),
    ).toMatchObject({ state: 'open' })
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('FEEDBACK_DEV_OPEN_WINDOW'),
    )
    warn.mockRestore()
  })

  it('keeps the real window under `next dev` without the flag', async () => {
    vi.stubEnv('NODE_ENV', 'development')

    expect(await pageFor(CONF, 'k7m2qx', BEFORE)).toMatchObject({
      state: 'not-yet-open',
    })
  })

  it('ignores the flag in a production build', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('FEEDBACK_DEV_OPEN_WINDOW', '1')

    expect(await pageFor(CONF, 'k7m2qx', BEFORE)).toMatchObject({
      state: 'not-yet-open',
    })
  })

  it('ignores the flag in tests', async () => {
    vi.stubEnv('FEEDBACK_DEV_OPEN_WINDOW', '1')

    expect(await pageFor(CONF, 'k7m2qx', BEFORE)).toMatchObject({
      state: 'not-yet-open',
    })
  })
})

describe('resolveFeedbackTarget().page — the request’s own clock', () => {
  it('judges "public" at `now`, not at the wall clock', async () => {
    // Published by `now`, not yet by the real clock: only `now` can show it.
    const page = await pageFor(
      { ...CONF, programDate: '2099-01-01' },
      'k7m2qx',
      new Date('2099-06-01T00:00:00.000Z'),
    )
    expect(page).toMatchObject({
      state: 'closed',
      talk: { title: 'Kubernetes for everyone' },
    })
  })
})

describe('resolveFeedbackTarget().page — stored codes are normalized', () => {
  it('resolves a code stored in uppercase (a Studio edit)', async () => {
    h.dataset.push(
      talk('talk-upper', 'conf-A', { feedbackCode: 'ABC234' }),
      day('day-upper', 'conf-A', '2026-10-26', 'official', [
        slot('talk-upper', '10:00', '10:40'),
      ]),
    )
    expect(await pageFor(CONF, 'abc234', DURING)).toMatchObject({
      state: 'open',
      talk: { title: 'Title of talk-upper' },
    })
  })
})

describe('resolveFeedbackTarget().page — Closed never reveals a non-public talk', () => {
  it('withholds the title and speakers after the window when the program was never published', async () => {
    expect(
      await pageFor(
        { ...CONF, programDate: null },
        'k7m2qx',
        new Date('2026-10-28T14:40:00.000Z'),
      ),
    ).toEqual({ state: 'closed', talk: null })
  })
})

describe('feedbackCodeIndex — the one cached read', () => {
  it('is tagged per conference and lives at most 5 minutes', async () => {
    await feedbackCodeIndex('conf-A')
    expect(h.cacheTag).toEqual([feedbackCodeIndexTag('conf-A')])
    expect(h.cacheLife).toEqual([FEEDBACK_CODE_INDEX_LIFE])
    expect(FEEDBACK_CODE_INDEX_LIFE.revalidate).toBe(300)
    // Next's docs: expire must be LONGER than revalidate.
    expect(FEEDBACK_CODE_INDEX_LIFE.expire).toBeGreaterThan(300)
    expect(FEEDBACK_CODE_INDEX_LIFE.expire).toBeLessThanOrEqual(301)
  })

  it('reads two conference-scoped roots and nothing per code', async () => {
    await feedbackCodeIndex('conf-A')
    expect(h.reads).toHaveLength(2)
    for (const { query, params } of h.reads) {
      expect(query).toContain('conference._ref == $conferenceId')
      expect(query.match(/\*\[/g)).toHaveLength(1)
      expect(Object.keys(params)).toEqual(['conferenceId'])
    }
  })

  it('throws rather than caching an answer it does not recognise as empty', async () => {
    h.dataset = [{ _id: 'x', _type: 'other' }]
    // An empty conference is an empty index...
    expect((await feedbackCodeIndex('conf-A')).size).toBe(0)
    // ...but a non-array answer is not.
    const { clientReadUncached } = await import('@/lib/sanity/client')
    const spy = vi
      .spyOn(clientReadUncached, 'fetch')
      .mockResolvedValueOnce(null as never)
    await expect(feedbackCodeIndex('conf-A')).rejects.toThrow(/shape/)
    spy.mockRestore()
  })

  it("opens with 'use cache: remote'", () => {
    // The directive is inert under Vitest; without it every scan would read
    // Sanity. Pinned on the source.
    const source = readFileSync(join(__dirname, 'attendee.ts'), 'utf8')
    const body = source.slice(
      source.indexOf('export async function feedbackCodeIndex'),
    )
    expect(body.slice(body.indexOf('{\n') + 2).trimStart()).toMatch(
      /^'use cache: remote'\n/,
    )
  })
})

describe('feedbackCodeForTalk — the programme link (#1472)', () => {
  it('gives the current code of a confirmed, public talk', async () => {
    expect(await feedbackCodeForTalk(CONF, 'talk-open', DURING)).toBe('k7m2qx')
  })

  it('follows a rotation: the link always resolves to the code held NOW', async () => {
    const held = h.dataset.find((d) => d._id === 'talk-open')!
    held.feedbackCode = 'rpt234'
    expect(await feedbackCodeForTalk(CONF, 'talk-open', DURING)).toBe('rpt234')
  })

  it('refuses a malformed talk id without a read', async () => {
    for (const raw of [undefined, 42, '', '../x', 'a b', 'x'.repeat(129)]) {
      expect(await feedbackCodeForTalk(CONF, raw, DURING)).toBeNull()
    }
    expect(h.reads).toHaveLength(0)
  })

  it('refuses a talk of another tenant, reading only this conference', async () => {
    h.dataset.push(
      talk('talk-foreign', 'conf-B', { feedbackCode: 'zzz234' }),
      day('day-B', 'conf-B', '2026-10-26', 'official', [
        slot('talk-foreign', '10:00', '10:40'),
      ]),
    )
    expect(await feedbackCodeForTalk(CONF, 'talk-foreign', DURING)).toBeNull()
    for (const read of h.reads) expect(read.params.conferenceId).toBe('conf-A')
    // The fixture is live: on its own conference it resolves.
    expect(
      await feedbackCodeForTalk(
        { ...CONF, _id: 'conf-B' },
        'talk-foreign',
        DURING,
      ),
    ).toBe('zzz234')
  })

  it('refuses a talk before the program is published, or with no program date', async () => {
    const unpublished = { ...CONF, programDate: '2026-11-01' }
    expect(
      await feedbackCodeForTalk(unpublished, 'talk-open', DURING),
    ).toBeNull()
    expect(
      await feedbackCodeForTalk(
        { ...CONF, programDate: null },
        'talk-open',
        DURING,
      ),
    ).toBeNull()
  })

  it('refuses a talk only on a DRAFT schedule (not public)', async () => {
    h.dataset.push(
      talk('talk-drafted', 'conf-A', { feedbackCode: 'dft234' }),
      day('day-draft', 'conf-A', '2026-10-26', 'draft', [
        slot('talk-drafted', '11:00', '11:40'),
      ]),
    )
    expect(await feedbackCodeForTalk(CONF, 'talk-drafted', DURING)).toBeNull()
    // The same talk on an official day is public: the draft day is the reason.
    h.dataset.push(
      day('day-2', 'conf-A', '2026-10-27', 'official', [
        slot('talk-drafted', '09:00', '09:40'),
      ]),
    )
    expect(await feedbackCodeForTalk(CONF, 'talk-drafted', DURING)).toBe(
      'dft234',
    )
  })

  it('refuses a talk that is not confirmed, even on the schedule', async () => {
    h.dataset.push(
      talk('talk-accepted', 'conf-A', {
        status: 'accepted',
        feedbackCode: 'abc234',
      }),
      day('day-2', 'conf-A', '2026-10-27', 'official', [
        slot('talk-accepted', '09:00', '09:40'),
      ]),
    )
    expect(await feedbackCodeForTalk(CONF, 'talk-accepted', DURING)).toBeNull()
  })

  it('never answers for a draft or release version, by either id', async () => {
    h.dataset.push(
      talk('talk-new', 'conf-A', {}),
      talk('drafts.talk-new', 'conf-A', { feedbackCode: 'drft23' }),
      talk('versions.rel1.talk-new', 'conf-A', { feedbackCode: 'vers23' }),
      day('day-2', 'conf-A', '2026-10-27', 'official', [
        slot('talk-new', '09:00', '09:40'),
      ]),
    )
    for (const id of [
      'talk-new',
      'drafts.talk-new',
      'versions.rel1.talk-new',
    ]) {
      expect(await feedbackCodeForTalk(CONF, id, DURING)).toBeNull()
    }
    expect(
      await feedbackCodeForTalk(CONF, 'drafts.talk-open', DURING),
    ).toBeNull()
  })

  it('refuses a code two published talks hold, for both of them', async () => {
    h.dataset.push(talk('talk-dup', 'conf-A', { feedbackCode: 'k7m2qx' }))
    expect(await feedbackCodeForTalk(CONF, 'talk-open', DURING)).toBeNull()
    expect(await feedbackCodeForTalk(CONF, 'talk-dup', DURING)).toBeNull()
  })
})
