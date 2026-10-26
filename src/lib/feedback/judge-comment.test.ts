/**
 * @vitest-environment node
 *
 * A comment judged after Submit (Content judgement spec §6, §7.1, §7.2, §15),
 * with the real `submitFeedback`, the real OpenRouter client, and the real
 * `@sanity/client` writes applied by `@sanity/mutator` (`versionedSanityStore`).
 * Scripted: the network to OpenRouter (global `fetch`), and
 * `runAfterResponse`, which hands each task to the test so it can run them
 * in a chosen order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  tasks: [] as (() => Promise<void>)[],
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})
vi.mock('next/cache', () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  updateTag: () => {},
}))
vi.mock('@/server/runAfterResponse', () => ({
  runAfterResponse: (task: () => Promise<void>) => {
    h.tasks.push(task)
  },
}))

import { JEV_ENDPOINT } from '@/lib/content-judgement/client'
import { judgementId } from '@/lib/content-judgement/store'
import { hideResponses } from './admin'
import { submitFeedback } from './submit'

const store = () => h.store!
const ref = (id: string) => ({ _type: 'reference', _ref: id })

const CONF = {
  _id: 'conf-A',
  endDate: '2026-10-27',
  programDate: '2026-08-01',
  organization: { _ref: 'org-A' },
}
/** 10:30 in Oslo on 2026-10-26, inside talk-open's window. */
const DURING = new Date('2026-10-26T09:30:00.000Z')
const CODE = 'k7m2qx'

const MODEL = 'typesafe/jev-1.14-20261014'
const noul = (value: number) => ({ type: 'noul', noul: value })
const answers = (abusive = 0.1, personal_info = 0.02) => ({
  abusive: noul(abusive),
  sexual: noul(0),
  spam: noul(0.02),
  personal_info: noul(personal_info),
})
const jevOk = (a = answers()) =>
  Response.json({ model: MODEL, usage: { input_tokens: 412 }, answers: a })

const fetchMock = vi.fn<typeof fetch>()

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
const organization = (enabled: boolean) => ({
  _id: 'org-A',
  _type: 'organization',
  contentJudgement: { enabled },
})

const responses = () =>
  store()
    .all()
    .filter((doc) => doc._type === 'feedbackResponse')
const judgements = () =>
  store()
    .all()
    .filter((doc) => doc._type === 'contentJudgement')

let cookie: string | undefined

/** One tap from this device; the cookie it sets is kept for the next. */
async function tap(colour: string, comment?: string) {
  const result = await submitFeedback({
    conference: CONF,
    code: CODE,
    colour,
    comment,
    cookie,
    now: new Date(),
  })
  if (result.cookie) cookie = result.cookie.value
  return result.outcome
}

/** Run every task handed to `runAfterResponse` so far, in order. */
async function runTasks() {
  const tasks = h.tasks.splice(0)
  for (const task of tasks) await task()
}

/** The bodies of every call that reached OpenRouter. */
const sentComments = () =>
  fetchMock.mock.calls.map(([, init]) => {
    const body = JSON.parse(String(init?.body)) as {
      state: { comment: string }
    }
    return body.state.comment
  })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(DURING)
  vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => jevOk())
  h.tasks = []
  cookie = undefined
  store().reset([
    { _id: 'sp-live', _type: 'speaker', _rev: 'rev-sp', name: 'Live' },
    organization(true),
    talk('talk-open', 'conf-A', CODE),
    day('day-1', 'conf-A', '2026-10-26', [['talk-open', '10:00', '10:40']]),
  ])
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('what triggers a judging (§6)', () => {
  it('judges a new comment: record and summary in ONE transaction, no copy of the text', async () => {
    fetchMock.mockImplementation(async () => jevOk(answers(0.88, 0.61)))
    expect(await tap('red', 'Speakeren er en idiot')).toMatchObject({
      state: 'answered',
    })
    expect(h.tasks).toHaveLength(1)
    const commitsBefore = store().commits.length
    await runTasks()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(JEV_ENDPOINT)
    // One transaction wrote both.
    expect(store().commits).toHaveLength(commitsBefore + 1)
    const [response] = responses()
    const [judgement] = judgements()
    expect(judgement).toMatchObject({
      _id: judgementId(response._id),
      conference: { _ref: 'conf-A' },
      surface: 'feedbackComment',
      content: { _ref: response._id, _weak: true },
      model: MODEL,
      questionSet: 'v2',
      inputTokens: 412,
    })
    expect(JSON.stringify(judgement)).not.toContain('idiot')
    expect(response.judgement).toEqual({
      state: 'judged',
      reasons: [
        {
          _key: 'comment.abusive',
          part: 'comment',
          question: 'abusive',
          probability: 0.88,
        },
        {
          _key: 'comment.personal_info',
          part: 'comment',
          question: 'personal_info',
          probability: 0.61,
        },
      ],
      model: MODEL,
      questionSet: 'v2',
      judgedAt: DURING.toISOString(),
    })
  })

  it('a colour-only tap schedules nothing', async () => {
    await tap('green')
    expect(h.tasks).toHaveLength(0)
    expect(responses()[0].judgement).toBeUndefined()
  })

  it('a colour change after a judged comment does not judge again', async () => {
    await tap('green', 'Fine talk, slides too small')
    await runTasks()
    await tap('yellow')
    await runTasks()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('an unchanged comment is not judged again', async () => {
    await tap('green', 'Fine talk, slides too small')
    await runTasks()
    await tap('green', 'Fine talk, slides too small')
    expect(h.tasks).toHaveLength(1)
    await runTasks()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(judgements()).toHaveLength(1)
  })

  it('a changed comment is judged again: the new Judgement replaces the old and clears the Keep mark', async () => {
    await tap('green', 'first wording')
    await runTasks()
    const [{ _id }] = responses()
    store().put({
      ...store().doc(_id)!,
      keptAt: '2026-10-26T09:00:00.000Z',
      keptBy: { _type: 'reference', _ref: 'sp-org', _weak: true },
    })
    fetchMock.mockImplementation(async () => jevOk(answers(0.9)))

    await tap('green', 'second wording')
    await runTasks()

    expect(sentComments()).toEqual(['first wording', 'second wording'])
    expect(judgements()).toHaveLength(1)
    const response = store().doc(_id)!
    expect(response.judgement).toMatchObject({
      state: 'judged',
      reasons: [{ question: 'abusive', probability: 0.9 }],
    })
    expect(response.keptAt).toBeUndefined()
    expect(response.keptBy).toBeUndefined()
  })

  it('a reword after a tallied Keep starts the tally over for the new Judgement', async () => {
    await tap('red', 'first wording')
    await runTasks()
    const [{ _id }] = responses()
    const first = store().doc(_id)!
    store().put({
      ...first,
      judgement: {
        ...(first.judgement as object),
        talliedAt: '2026-10-26T09:00:00.000Z',
      },
      keptAt: '2026-10-26T09:00:00.000Z',
      keptBy: { _type: 'reference', _ref: 'sp-org', _weak: true },
    })
    fetchMock.mockImplementation(async () => jevOk(answers(0.9)))
    await tap('red', 'second wording')
    await runTasks()
    expect(
      (store().doc(_id)!.judgement as { talliedAt?: string }).talliedAt,
    ).toBeUndefined()

    await hideResponses({
      conferenceId: 'conf-A',
      responseIds: [_id],
      now: new Date(),
      tally: true,
    })
    const tallies = store()
      .all()
      .filter((d) => d._type === 'judgementTally')
    expect(tallies).toHaveLength(1)
    expect(tallies[0]).toMatchObject({
      question: 'abusive',
      band: '0.9-1',
      agreed: 1,
      disagreed: 0,
    })
  })

  it('an emptied comment deletes the Judgement and the summary, with no call', async () => {
    await tap('green', 'some comment')
    await runTasks()
    const [{ _id }] = responses()
    store().put({
      ...store().doc(_id)!,
      keptAt: '2026-10-26T09:00:00.000Z',
      keptBy: { _type: 'reference', _ref: 'sp-org', _weak: true },
    })
    expect(judgements()).toHaveLength(1)

    await tap('green', '')
    expect(h.tasks).toHaveLength(1)
    await runTasks()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(judgements()).toHaveLength(0)
    const response = store().doc(_id)!
    expect(response.comment).toBeUndefined()
    expect(response.judgement).toBeUndefined()
    expect(response.keptAt).toBeUndefined()
    expect(response.keptBy).toBeUndefined()
  })

  it('sends nothing while the organization has content judgement off', async () => {
    store().put(organization(false))
    await tap('red', 'anything at all')
    await runTasks()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(judgements()).toHaveLength(0)
    expect(responses()[0].judgement).toBeUndefined()
  })

  it('while off, a reworded comment loses the Judgement about its old text, with no call', async () => {
    await tap('red', 'first wording')
    await runTasks()
    const [{ _id }] = responses()
    store().put({
      ...store().doc(_id)!,
      keptAt: '2026-10-26T09:00:00.000Z',
      keptBy: { _type: 'reference', _ref: 'sp-org', _weak: true },
    })
    store().put(organization(false))

    await tap('red', 'second wording')
    await runTasks()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(judgements()).toHaveLength(0)
    const response = store().doc(_id)!
    expect(response.judgement).toBeUndefined()
    expect(response.keptAt).toBeUndefined()
    // Unchanged text keeps its Judgement while off.
    store().put(organization(true))
    await tap('red', 'third wording')
    await runTasks()
    expect(judgements()).toHaveLength(1)
    store().put(organization(false))
    await tap('red', 'third wording')
    await runTasks()
    expect(judgements()).toHaveLength(1)
    expect(store().doc(_id)!.judgement).toMatchObject({ state: 'judged' })
  })

  it('while off, a reworded comment with a Keep mark and no Judgement loses the mark', async () => {
    store().put(organization(false))
    await tap('red', 'first wording')
    await runTasks()
    const [{ _id }] = responses()
    store().put({
      ...store().doc(_id)!,
      keptAt: '2026-10-26T09:00:00.000Z',
      keptBy: { _type: 'reference', _ref: 'sp-org', _weak: true },
    })
    await tap('red', 'second wording')
    await runTasks()
    expect(fetchMock).not.toHaveBeenCalled()
    const response = store().doc(_id)!
    expect(response.comment).toBe('second wording')
    expect(response.keptAt).toBeUndefined()
    expect(response.keptBy).toBeUndefined()
  })

  it('sends nothing for a conference without an organization', async () => {
    await submitFeedback({
      conference: { ...CONF, organization: undefined },
      code: CODE,
      colour: 'red',
      comment: 'anything at all',
      cookie,
      now: new Date(),
    })
    await runTasks()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('never-fail (§6, §15)', () => {
  it('the submit succeeds and the comment is not judged when the key is missing (the client throws)', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await tap('red', 'a comment')).toMatchObject({ state: 'answered' })
    await runTasks()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
    expect(responses()[0].comment).toBe('a comment')
    expect(responses()[0].judgement).toBeUndefined()
    error.mockRestore()
  })

  it('a call that times out leaves the comment stored and marked not judged: failed', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(DURING)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    expect(await tap('red', 'a comment')).toMatchObject({ state: 'answered' })
    const running = runTasks()
    await vi.advanceTimersByTimeAsync(20_000)
    await running

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(responses()[0].judgement).toEqual({
      state: 'notJudged',
      notJudgedWhy: 'failed',
      // Written when the call gave up, 20 s after it started.
      judgedAt: new Date(DURING.getTime() + 20_000).toISOString(),
    })
    expect(judgements()).toHaveLength(0)
  })

  it('a refused call (402, spend cap) marks the comment not judged: spendCap', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockImplementation(
      async () => new Response('{"error":"credits"}', { status: 402 }),
    )
    expect(await tap('red', 'a comment')).toMatchObject({ state: 'answered' })
    await runTasks()
    expect(responses()[0].judgement).toMatchObject({
      state: 'notJudged',
      notJudgedWhy: 'spendCap',
    })
  })

  it('a network error marks the comment not judged: failed, and drops a stale record of the old text', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await tap('red', 'first wording')
    await runTasks()
    expect(judgements()).toHaveLength(1)
    fetchMock.mockImplementation(async () => {
      throw new TypeError('fetch failed')
    })
    await tap('red', 'second wording')
    await runTasks()
    expect(responses()[0].judgement).toMatchObject({
      state: 'notJudged',
      notJudgedWhy: 'failed',
    })
    // Only the latest Judgement per content is kept (§7.1): none now.
    expect(judgements()).toHaveLength(0)
  })

  it('a failed write is logged and never thrown', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await tap('red', 'a comment')
    store().failWrites(new Error('503 write refused'))
    await expect(runTasks()).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('the stale-task guard: two quick edits', () => {
  /** A fetch that answers only when the test says so. */
  function heldFetch() {
    let release!: (response: Response) => void
    const held = new Promise<Response>((resolve) => {
      release = resolve
    })
    return { held, release: (r: Response) => release(r) }
  }

  it('a task that learns a newer comment landed before it called Jev makes no call', async () => {
    await tap('red', 'first wording')
    await tap('red', 'second wording')
    expect(h.tasks).toHaveLength(2)
    fetchMock.mockImplementation(async () => jevOk(answers(0.9)))
    await runTasks()
    // The first task saw "second wording" stored and stepped aside.
    expect(sentComments()).toEqual(['second wording'])
    expect(judgements()).toHaveLength(1)
    expect(responses()[0].judgement).toMatchObject({ state: 'judged' })
  })

  it('a task whose Jev call outlived a newer comment drops its answer', async () => {
    const first = heldFetch()
    fetchMock.mockImplementationOnce(() => first.held)
    await tap('red', 'first wording')
    const [taskA] = h.tasks.splice(0)
    const runningA = taskA()
    // A is inside its Jev call. Now the attendee rewords, and B runs through.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    fetchMock.mockImplementation(async () => jevOk(answers(0.9, 0)))
    await tap('red', 'second wording')
    await runTasks()
    const [response] = responses()
    expect(response.judgement).toMatchObject({
      reasons: [{ question: 'abusive', probability: 0.9 }],
    })
    const commitsAfterB = store().commits.length

    // A's answer arrives: about the old wording, flagged differently.
    first.release(jevOk(answers(0.01, 0.95)))
    await runningA

    expect(store().commits).toHaveLength(commitsAfterB)
    expect(store().doc(response._id)!.judgement).toMatchObject({
      reasons: [{ question: 'abusive', probability: 0.9 }],
    })
    expect(judgements()).toHaveLength(1)
  })

  it('a delayed emptied-comment task never wipes a newer comment’s Judgement', async () => {
    await tap('red', 'first wording')
    await runTasks()
    await tap('red', '')
    await tap('red', 'refilled')
    const [emptyTask, refilledTask] = h.tasks.splice(0)
    await refilledTask()
    expect(judgements()).toHaveLength(1)
    await emptyTask()
    expect(judgements()).toHaveLength(1)
    const [response] = responses()
    expect(response.comment).toBe('refilled')
    expect(response.judgement).toMatchObject({ state: 'judged' })
  })

  it('an unrelated change under the write (an organizer’s flag) is retried, not dropped', async () => {
    await tap('red', 'a comment')
    const [{ _id }] = responses()
    store().beforeNextCommit(() => {
      // A write between the task's re-read and its commit.
      store().put({
        ...store().doc(_id)!,
        _rev: 'rev-organizer',
        hiddenAt: DURING.toISOString(),
      })
    })
    await runTasks()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const response = store().doc(_id)!
    expect(response.judgement).toMatchObject({ state: 'judged' })
    expect(response.hiddenAt).toBe(DURING.toISOString())
    expect(judgements()).toHaveLength(1)
  })
})
