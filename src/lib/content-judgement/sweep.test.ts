/** @vitest-environment node */
import type { SanityStore } from '../../../__tests__/helpers/sanityStore'
import { sweepOrphanJudgements } from './sweep'
import { hasStoredJudgements } from './records'

const h = vi.hoisted(() => ({
  store: null as SanityStore | null,
  revalidateTag: vi.fn(),
  fetch: vi.fn(),
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createSanityStore } =
    await import('../../../__tests__/helpers/sanityStore')
  h.store = createSanityStore()
  return {
    ...h.store.clients,
    clientReadUncached: { fetch: h.fetch },
  }
})
vi.mock('next/cache', () => ({ revalidateTag: h.revalidateTag }))

const NOW = new Date('2026-10-26T04:50:00Z')
const ref = (id: string) => ({ _type: 'reference', _ref: id })
const conference = (id: string) => ({
  _id: id,
  _rev: `rev-${id}`,
  _type: 'conference',
  organization: ref(`org-${id}`),
})
const judgement = (
  id: string,
  conferenceId = 'a',
  contentId = `content-${id}`,
) => ({
  _id: id,
  _rev: `rev-${id}`,
  _type: 'contentJudgement',
  conference: ref(conferenceId),
  content: { ...ref(contentId), _weak: true },
})
const storedIds = () =>
  h
    .store!.ofType('contentJudgement')
    .map((doc) => doc._id)
    .sort()
const sweep = () =>
  sweepOrphanJudgements({
    now: NOW,
    deadline: new Date(NOW.getTime() + 60_000),
  })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  h.store!.reset([conference('a'), conference('b')])
  h.revalidateTag.mockReset()
  h.fetch
    .mockReset()
    .mockImplementation(h.store!.clients.clientReadUncached.fetch)
})
afterEach(() => vi.useRealTimers())

it.each(['wallPost', 'feedbackResponse', 'conversation'])(
  'deletes only missing weak content, preserving live %s even in another conference',
  async (_type) => {
    h.store!.reset([
      conference('a'),
      conference('b'),
      { _id: 'live', _type, conference: ref('b') },
      judgement('gone'),
      judgement('survives', 'a', 'live'),
      judgement('b-live', 'b', 'live'),
    ])
    expect(await sweep()).toEqual({
      conferences: 2,
      deleted: 1,
      timedOut: false,
    })
    expect(storedIds()).toEqual(['b-live', 'survives'])
  },
)

it('conference A never deletes B judgements in its pass', async () => {
  h.store!.reset([
    conference('a'),
    conference('b'),
    judgement('a-orphan'),
    judgement('b-orphan', 'b'),
  ])
  h.revalidateTag.mockImplementation((tag) => {
    if (tag === 'sanity:conference-a') {
      expect(storedIds()).toEqual(['b-orphan'])
      // Stop before B starts; B remains eligible for the next run.
      vi.setSystemTime(new Date(NOW.getTime() + 60_000))
    }
  })
  expect(await sweep()).toEqual({ conferences: 0, deleted: 1, timedOut: true })
  expect(storedIds()).toEqual(['b-orphan'])
})

it('deletes judgements of missing conferences even when their content still exists', async () => {
  h.store!.reset([
    conference('a'),
    { _id: 'live', _type: 'wallPost', conference: ref('a') },
    judgement('survives', 'a', 'live'),
    judgement('lost-conference', 'gone', 'live'),
  ])
  expect(await sweep()).toEqual({ conferences: 1, deleted: 1, timedOut: false })
  expect(storedIds()).toEqual(['survives'])
})

it.each(['a', 'gone'])(
  'splits 205 orphans for conference %s across 100/100/5 transactions',
  async (id) => {
    h.store!.reset([
      conference('a'),
      ...Array.from({ length: 205 }, (_, i) => judgement(`j-${i}`, id)),
    ])
    expect((await sweep()).deleted).toBe(205)
    expect(
      h.store!.commits.map((tx) => tx.filter((m) => 'delete' in m).length),
    ).toEqual([100, 100, 5])
    expect(storedIds()).toEqual([])
  },
)

it('expires conference and organization privacy tags after the final judgement disappears', async () => {
  h.store!.reset([conference('a'), judgement('gone')])
  expect(await hasStoredJudgements('org-a')).toBe(true)
  await sweep()
  expect(await hasStoredJudgements('org-a')).toBe(false)
  expect(h.revalidateTag.mock.calls).toEqual([
    ['sanity:conference-a', { expire: 0 }],
    ['sanity:organization-org-a', { expire: 0 }],
  ])
})

it('visits no conference when no Judgement is stored', async () => {
  expect(await sweep()).toEqual({ conferences: 0, deleted: 0, timedOut: false })
  // Discovery, then the missing-conference pass: none per conference.
  expect(h.fetch).toHaveBeenCalledTimes(2)
})

it('does not invalidate privacy when nothing was deleted', async () => {
  h.store!.reset([
    conference('a'),
    conference('b'),
    { _id: 'content-live', _type: 'wallPost', conference: ref('a') },
    judgement('live', 'a', 'content-live'),
  ])
  // Only conference a holds a Judgement, so b is never visited.
  expect(await sweep()).toEqual({ conferences: 1, deleted: 0, timedOut: false })
  expect(h.revalidateTag).toHaveBeenCalledTimes(0)
})

it('stops before discovery when even one request cannot finish', async () => {
  h.store!.reset([conference('a'), judgement('gone')])
  expect(
    await sweepOrphanJudgements({
      now: NOW,
      deadline: new Date(NOW.getTime() + 4_999),
    }),
  ).toEqual({ conferences: 0, deleted: 0, timedOut: true })
  expect(h.fetch).toHaveBeenCalledTimes(0)
  expect(storedIds()).toEqual(['gone'])
})

it('stops before starting a batch without its full read and write budget', async () => {
  h.store!.reset([conference('a'), judgement('gone')])
  expect(
    await sweepOrphanJudgements({
      now: NOW,
      deadline: new Date(NOW.getTime() + 9_999),
    }),
  ).toEqual({ conferences: 0, deleted: 0, timedOut: true })
  expect(h.fetch).toHaveBeenCalledTimes(1)
  expect(storedIds()).toEqual(['gone'])
})

it('rechecks the remaining write budget after a slow selection', async () => {
  h.store!.reset([conference('a'), judgement('gone')])
  h.fetch.mockImplementation(async (...args) => {
    const result = await h.store!.clients.clientReadUncached.fetch(...args)
    if (args[1]?.conferenceId)
      vi.setSystemTime(new Date(NOW.getTime() + 56_000))
    return result
  })
  expect(await sweep()).toEqual({ conferences: 0, deleted: 0, timedOut: true })
  expect(storedIds()).toEqual(['gone'])
})

it('reads fresh with bounded requests and propagates failed writes without deleting or invalidating', async () => {
  h.store!.reset([conference('a'), judgement('gone')])
  h.store!.failWrites()
  await expect(sweep()).rejects.toThrow('write refused')
  expect(storedIds()).toEqual(['gone'])
  expect(h.revalidateTag).toHaveBeenCalledTimes(0)
  for (const [, , options] of h.fetch.mock.calls) {
    expect(options).toMatchObject({
      cache: 'no-store',
      timeout: 5_000,
      signal: expect.any(AbortSignal),
    })
  }
})
