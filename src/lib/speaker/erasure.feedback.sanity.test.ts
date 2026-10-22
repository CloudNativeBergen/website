/**
 * @vitest-environment node
 *
 * Speaker erasure and Session Feedback (speaker feedback spec §12.3, #1438),
 * on the STORED DOCUMENTS of `versionedSanityStore`: every erasure read runs
 * through groq-js, the erasure transaction and each fold chunk are built by
 * the real `@sanity/client` and applied with `@sanity/mutator`, with revision
 * guards and the API-version rule for `versions.**`. `releases::all()` is
 * answered here, as production answers it.
 *
 * A talk whose only non-erased speaker is the subject loses its Feedback
 * Code on every version in the erasure transaction, and its responses are
 * folded after it; a talk with another live speaker keeps everything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

type Doc = Record<string, unknown> & { _id: string }
type Fetch = (
  query: string,
  params?: Record<string, unknown>,
  options?: Record<string, unknown>,
) => Promise<unknown>
interface Writer {
  fetch: Fetch
  [key: string]: unknown
}

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  releases: [] as { name: string; state: string }[],
  releasesFail: false,
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  const clients = h.store.clients as {
    clientWrite: Writer & { withConfig: (c: { apiVersion: string }) => Writer }
  }
  const withReleases = (w: Writer): Writer => ({
    ...w,
    fetch: async (query, params, options) => {
      if (!query.includes('releases::all()')) {
        return w.fetch(query, params, options)
      }
      if (h.releasesFail) throw new Error('503 releases unavailable')
      return h.releases.map((r) => ({
        _id: `_.releases.${r.name}`,
        state: r.state,
      }))
    },
  })
  return {
    ...h.store.clients,
    clientWrite: {
      ...clients.clientWrite,
      withConfig: (c: { apiVersion: string }) =>
        withReleases(clients.clientWrite.withConfig(c)),
    },
  }
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MintTooSlowError, ensureFeedbackCode } from '@/lib/feedback/code'
import {
  MINT_COMMIT_BUDGET_MS,
  MINT_WRITE_BOUND_MS,
  SUBMIT_MAX_DURATION_S,
  SUBMIT_WRITE_BOUND_MS,
} from '@/lib/feedback/bounds'
import { talkTotals, type TalkCounts } from '@/lib/feedback/totals'
import {
  FEEDBACK_SETTLE_MS,
  MAX_SETTLE_LOOKS,
  eraseSpeakerInPlace,
  verifySpeakerErasure,
} from './erasure'

const store = () => h.store!
const ref = (id: string, key?: string) => ({
  _type: 'reference',
  _ref: id,
  ...(key && { _key: key }),
})

const ADA = 'spkada0001'
const BOB = 'spkbob0002'
const CAT = 'spkcat0003'

const speaker = (id: string, extra: object = {}) => ({
  _id: id,
  _type: 'speaker',
  _rev: `rev-${id}`,
  name: `Name ${id}`,
  email: `${id}@example.com`,
  slug: { _type: 'slug', current: id },
  ...extra,
})

const talk = (id: string, speakers: string[], extra: object = {}) => ({
  _id: id,
  _type: 'talk',
  _rev: `rev-${id}`,
  conference: ref('conf-1'),
  status: 'confirmed',
  title: `Title of ${id}`,
  speakers: speakers.map((s, i) => ref(s, `k${i}`)),
  feedbackCode: `CODE${id.slice(-2)}`,
  ...extra,
})

const COLOURS = ['green', 'yellow', 'red'] as const
const responses = (talkId: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    _id: `${talkId}-r${String(i).padStart(4, '0')}`,
    _type: 'feedbackResponse',
    _rev: `rev-${talkId}-${i}`,
    talk: ref(talkId),
    conference: ref('conf-1'),
    colour: COLOURS[i % 3],
    comment: i === 0 ? 'Ada was great' : undefined,
    submittedAt: '2026-06-10T08:00:00.000Z',
  }))

const live = (talkId: string) =>
  store()
    .all()
    .filter(
      (d) => d._type === 'feedbackResponse' && (d.talk as Doc)?._ref === talkId,
    )

const totals = (talkId: string) =>
  talkTotals(
    store().doc(talkId) as TalkCounts,
    live(talkId) as { colour?: unknown }[],
  ).combined

const folded = (id: string) => {
  const f = store().doc(id)?.feedbackFolded as Record<string, unknown>
  return f && { green: f.greenCount, yellow: f.yellowCount, red: f.redCount }
}

/** Settles at once: the in-flight Submit wait is its own test. */
const erase = () =>
  eraseSpeakerInPlace({
    speakerId: ADA,
    actor: 'op',
    waitForInFlightSubmits: async () => {},
  })

/** A conference still running, so a mint is allowed (§5). */
const LIVE_CONF = { _id: 'conf-1', endDate: '2099-01-01' }

/** Ada alone on talk-solo (and its draft, and an active release copy);
 * with Bob on talk-duo; with Cat, already erased, on talk-was-duo. */
function world(extra: Doc[] = []) {
  store().reset([
    {
      _id: 'conf-1',
      _type: 'conference',
      title: 'Conf',
      endDate: '2026-06-11',
    },
    speaker(ADA),
    speaker(BOB),
    speaker(CAT, { erasedAt: '2026-01-01T00:00:00.000Z' }),
    talk('talk-solo', [ADA]),
    { ...talk('drafts.talk-solo', [ADA]), _rev: 'rev-draft-solo' },
    { ...talk('versions.rel-a.talk-solo', [ADA]), _rev: 'rev-rel-solo' },
    talk('talk-duo', [ADA, BOB]),
    talk('talk-was-duo', [CAT, ADA]),
    ...responses('talk-solo', 6),
    ...responses('talk-duo', 4),
    ...responses('talk-was-duo', 2),
    ...extra,
  ])
}

beforeEach(() => {
  h.releases = [{ name: 'rel-a', state: 'active' }]
  h.releasesFail = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('speaker erasure folds the feedback of talks no live speaker is left on', () => {
  it('unsets the code on every version in the erasure transaction, then folds every response; co-spoken talks are untouched', async () => {
    world()
    const before = {
      solo: totals('talk-solo'),
      duo: totals('talk-duo'),
      wasDuo: totals('talk-was-duo'),
    }

    const result = await erase()

    expect(result.err).toBeNull()
    // The code goes in the erasure transaction itself, guarded per version.
    const [erasureTx, ...foldTxs] = store().commits
    const unsets = erasureTx.flatMap((m) =>
      'patch' in m && JSON.stringify(m).includes('"unset":["feedbackCode"]')
        ? [[m.patch.id, m.patch.ifRevisionID]]
        : [],
    )
    expect(Object.fromEntries(unsets)).toEqual({
      'talk-solo': 'rev-talk-solo',
      'drafts.talk-solo': 'rev-draft-solo',
      'versions.rel-a.talk-solo': 'rev-rel-solo',
      'talk-was-duo': 'rev-talk-was-duo',
    })
    expect(
      erasureTx.some((m) => 'delete' in m && m.delete.id.includes('-r')),
    ).toBe(false)
    expect(foldTxs.length).toBeGreaterThan(0)

    for (const id of [
      'talk-solo',
      'drafts.talk-solo',
      'versions.rel-a.talk-solo',
    ]) {
      expect(store().doc(id)?.feedbackCode).toBeUndefined()
      expect(folded(id)).toEqual({ green: 2, yellow: 2, red: 2 })
    }
    expect(folded('talk-was-duo')).toEqual({ green: 1, yellow: 1, red: 0 })
    expect(live('talk-solo')).toEqual([])
    expect(live('talk-was-duo')).toEqual([])
    // Bob still speaks on talk-duo: nothing of it changes.
    expect(store().doc('talk-duo')).toMatchObject({
      feedbackCode: 'CODEuo',
      _rev: 'rev-talk-duo',
    })
    expect(live('talk-duo')).toHaveLength(4)

    expect({
      solo: totals('talk-solo'),
      duo: totals('talk-duo'),
      wasDuo: totals('talk-was-duo'),
    }).toEqual(before)
    expect(result.plan?.feedbackFoldTalkIds.sort()).toEqual([
      'talk-solo',
      'talk-was-duo',
    ])
    expect(result.feedbackFolds).toEqual([
      { talkId: 'talk-solo', status: 'folded', responses: 6, error: null },
      { talkId: 'talk-was-duo', status: 'folded', responses: 2, error: null },
    ])
    expect(result.verification).toMatchObject({
      residual: { feedbackCodes: 0, feedbackResponses: 0 },
    })
  })

  it('a second run plans nothing and commits nothing', async () => {
    world()
    await erase()
    const after = structuredClone(store().all())
    const commits = store().commits.length

    const again = await erase()

    expect(again.err).toBeNull()
    expect(again.plan?.noop).toBe(true)
    expect(again.plan?.feedbackFoldTalkIds).toEqual([])
    expect(store().commits).toHaveLength(commits)
    expect(store().all()).toEqual(after)
  })

  it('a response removed between the plan and a fold commit aborts that chunk; the re-plan does not count it', async () => {
    world()
    store().beforeNextCommit(() => {}) // the erasure transaction
    store().beforeNextCommit(() => store().remove('talk-solo-r0000'))

    const result = await erase()

    expect(result.err).toBeNull()
    expect(folded('talk-solo')).toEqual({ green: 1, yellow: 2, red: 2 })
    // The erasure, then one fold commit per talk: the refused one left none.
    expect(store().commits).toHaveLength(3)
    expect(live('talk-solo')).toEqual([])
  })

  it('a crash between fold chunks keeps the erasure, and the re-run folds the rest without double-counting', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-big', [ADA]),
      ...responses('talk-big', 150),
    ])
    const before = totals('talk-big')
    // The erasure, talk-big's first chunk, then a lost connection.
    store().beforeNextCommit(() => {})
    store().beforeNextCommit(() => {})
    store().beforeNextCommit(() => {
      throw new Error('socket hang up')
    })

    // The run would look again after the failed chunk; the process dies in
    // that second wait instead.
    let waits = 0
    const first = await eraseSpeakerInPlace({
      speakerId: ADA,
      actor: 'op',
      waitForInFlightSubmits: async () => {
        if (++waits > 1) throw new Error('process killed')
      },
    })

    expect(first.err?.message).toBe('process killed')
    expect(store().doc(ADA)?.name).toBe('Deleted speaker')
    expect(live('talk-big')).toHaveLength(50)
    expect(totals('talk-big')).toEqual(before)

    const second = await erase()

    expect(second.err).toBeNull()
    expect(second.plan?.feedbackFoldTalkIds).toContain('talk-big')
    expect(live('talk-big')).toEqual([])
    expect(folded('talk-big')).toEqual({ green: 50, yellow: 50, red: 50 })
    expect(totals('talk-big')).toEqual(before)
    expect(second.verification?.clean).toBe(true)
  })

  it('a talk edited between the read and the commit refuses the whole erasure, writing nothing', async () => {
    world()
    // A rotation of talk-solo's code lands after the plan was read.
    store().beforeNextCommit(() =>
      store().put({
        ...talk('talk-solo', [ADA]),
        feedbackCode: 'NEWONE',
        _rev: 'rev-rotated',
      }),
    )

    const result = await erase()

    expect(result.err?.message).toMatch(/revision/)
    expect(store().commits).toEqual([])
    expect(store().doc(ADA)?.name).toBe(`Name ${ADA}`)
    expect(store().doc('talk-solo')?.feedbackCode).toBe('NEWONE')
  })

  it.each([
    // Unlisted releases hold every such talk: any may have a release copy.
    ['a version waits in a scheduled release', false, ['talk-solo'], 6],
    ['the releases cannot be listed', true, ['talk-solo', 'talk-was-duo'], 8],
  ] as const)(
    'when %s, the erasure still commits, the reachable versions lose the code, and the fold is held and reported',
    async (_, releasesFail, held, unfolded) => {
      h.releases = [{ name: 'rel-s', state: 'scheduled' }]
      h.releasesFail = releasesFail
      world()
      store().remove('versions.rel-a.talk-solo')
      store().put({
        ...talk('versions.rel-s.talk-solo', [ADA]),
        _rev: 'rev-locked',
      })

      const result = await erase()

      expect(result.err).toBeNull()
      expect(store().doc(ADA)?.name).toBe('Deleted speaker')
      expect(store().doc('talk-solo')?.feedbackCode).toBeUndefined()
      expect(store().doc('drafts.talk-solo')?.feedbackCode).toBeUndefined()
      // Never patched: it would fail the erasure on every run.
      expect(store().doc('versions.rel-s.talk-solo')?._rev).toBe('rev-locked')
      expect(result.plan?.feedbackHeld.map((x) => x.talkId)).toEqual(held)
      expect(result.plan?.feedbackFoldTalkIds).toEqual(
        ['talk-solo', 'talk-was-duo'].filter(
          (id) => !(held as readonly string[]).includes(id),
        ),
      )
      expect(live('talk-solo')).toHaveLength(6)
      expect(result.verification?.clean).toBe(false)
      expect(result.verification?.residual.feedbackResponses).toBe(unfolded)
    },
  )

  it('is never CLEAN while a talk is held on unlisted releases, even with no responses left', async () => {
    h.releasesFail = true
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-solo', [ADA]),
      // An active release copy the run cannot see: it may still hold the code.
      { ...talk('versions.rel-a.talk-solo', [ADA]), _rev: 'rev-rel-solo' },
    ])

    const result = await erase()

    expect(result.err).toBeNull()
    expect(result.plan?.feedbackHeld.map((x) => x.talkId)).toEqual([
      'talk-solo',
    ])
    expect(result.verification?.residual.feedbackHeld).toBe(1)
    expect(result.verification?.clean).toBe(false)

    // Once the releases list again, the re-run finishes and verifies clean.
    h.releasesFail = false
    const again = await erase()
    expect(
      store().doc('versions.rel-a.talk-solo')?.feedbackCode,
    ).toBeUndefined()
    expect(again.verification?.clean).toBe(true)
  })

  it('a co-speaker whose speaker document is gone counts as erased', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      // `spkghost` was deleted; the talk still lists the reference.
      talk('talk-ghost', ['spkghost', ADA]),
      ...responses('talk-ghost', 2),
    ])

    const result = await erase()

    expect(result.err).toBeNull()
    expect(result.plan?.feedbackFoldTalkIds).toEqual(['talk-ghost'])
    expect(store().doc('talk-ghost')?.feedbackCode).toBeUndefined()
    expect(live('talk-ghost')).toEqual([])
  })

  it('sweeps every talk whose code it unset, also one with no responses to fold', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-quiet', [ADA]),
    ])
    // A draft made from the talk as it was, landing during the erasure's
    // commit: no guard can catch it, since it was not in the transaction.
    store().afterNextCommit(() =>
      store().put({ ...talk('drafts.talk-quiet', [ADA]), _rev: 'rev-late' }),
    )

    const result = await erase()

    expect(result.err).toBeNull()
    expect(result.plan?.feedbackFoldTalkIds).toEqual([])
    expect(store().doc('talk-quiet')?.feedbackCode).toBeUndefined()
    expect(store().doc('drafts.talk-quiet')?.feedbackCode).toBeUndefined()
  })

  it('folds nothing of a talk that gained a live co-speaker after the erasure listed it', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      speaker(BOB),
      talk('talk-solo', [ADA]),
      ...responses('talk-solo', 3),
    ])
    // Bob is added to the talk after the erasure listed the talks to fold,
    // just before the fold's first commit: its talk guard fails, and the
    // re-plan asks the eligibility check again.
    store().beforeNextCommit(() => {}) // the erasure transaction
    store().beforeNextCommit(() =>
      store().put({
        ...talk('talk-solo', [ADA, BOB]),
        feedbackCode: undefined,
        _rev: 'rev-bob-added',
      }),
    )

    const result = await erase()

    expect(result.err).toBeNull()
    expect(result.feedbackFolds).toEqual([
      {
        talkId: 'talk-solo',
        status: 'ineligible',
        responses: 0,
        error: null,
      },
    ])
    expect(live('talk-solo')).toHaveLength(3)
  })

  it.each([
    ['an organizer', { organizer: true } as const],
    ['the speaker’s own session', { speakerId: ADA }],
  ])(
    'a mint by %s that checked the speaker before the erasure and committed after it is unset by the erasure’s look after the wait',
    async (_, actor) => {
      store().reset([
        {
          _id: 'conf-1',
          _type: 'conference',
          title: 'Conf',
          endDate: '2099-01-01',
        },
        speaker(ADA),
        // Confirmed, sole speaker, no code yet.
        talk('talk-solo', [ADA], { feedbackCode: undefined }),
      ])
      // The mint checks the speaker is live, then reaches its commit; the
      // erasure transaction lands; only then does the mint's commit land
      // (during the erasure's settle wait). Nothing guards the mint against
      // that: the erasure's look after the wait unsets the code again.
      let mintAtCommit!: () => void
      const mintReady = new Promise<void>((r) => (mintAtCommit = r))
      let releaseMint!: () => void
      const mintMayCommit = new Promise<void>((r) => (releaseMint = r))
      store().beforeNextCommit(async () => {
        mintAtCommit()
        await mintMayCommit
      })
      const minting = ensureFeedbackCode({
        talkId: 'talk-solo',
        actor,
        conference: LIVE_CONF,
        now: new Date('2026-10-21T10:00:00.000Z'),
      })
      await mintReady

      const erased = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'op',
        waitForInFlightSubmits: async () => {
          releaseMint()
          await minting
        },
      })

      const minted = await minting
      expect(minted).toMatchObject({ status: 'ok', minted: true })
      expect(erased.err).toBeNull()
      expect(store().doc('talk-solo')?.feedbackCode).toBeUndefined()
      expect(erased.verification?.residual.feedbackCodes).toBe(0)
      expect(erased.verification?.clean).toBe(true)
    },
  )

  it('a mint’s stalled sweep cannot copy a code the erasure unset onto a draft', async () => {
    store().reset([
      {
        _id: 'conf-1',
        _type: 'conference',
        title: 'Conf',
        endDate: '2099-01-01',
      },
      speaker(ADA),
      talk('talk-solo', [ADA], { feedbackCode: undefined }),
    ])
    // The mint commits; a draft without the code appears right after it.
    store().beforeNextCommit(() => {}) // the mint's commit
    store().afterNextCommit(() =>
      store().put({
        ...talk('drafts.talk-solo', [ADA], { feedbackCode: undefined }),
        _rev: 'rev-draft',
      }),
    )
    // The sweep read the published code and the draft; its commit stalls
    // while the whole erasure runs and reports CLEAN.
    let erased: Awaited<ReturnType<typeof erase>> | undefined
    store().beforeNextCommit(async () => {
      erased = await erase()
    })

    const minted = await ensureFeedbackCode({
      talkId: 'talk-solo',
      actor: { organizer: true },
      conference: LIVE_CONF,
      now: new Date('2026-10-21T10:00:00.000Z'),
    })

    expect(minted).toMatchObject({ status: 'ok', minted: true })
    expect(erased?.err).toBeNull()
    expect(erased?.verification?.clean).toBe(true)
    // The stalled copy failed its guard on the published talk.
    expect(store().doc('talk-solo')?.feedbackCode).toBeUndefined()
    expect(store().doc('drafts.talk-solo')?.feedbackCode).toBeUndefined()
  })

  it('a mint whose liveness check is older than its budget at commit writes nothing', async () => {
    store().reset([
      {
        _id: 'conf-1',
        _type: 'conference',
        title: 'Conf',
        endDate: '2099-01-01',
      },
      speaker(ADA),
      talk('talk-solo', [ADA], { feedbackCode: undefined }),
    ])
    // The code-seed query, read after the check and before the commit, is
    // where the time goes.
    const start = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(start)
    store().beforeEachRead(() => {
      vi.mocked(Date.now).mockReturnValue(start + MINT_COMMIT_BUDGET_MS + 1)
    })

    await expect(
      ensureFeedbackCode({
        talkId: 'talk-solo',
        actor: { organizer: true },
        conference: LIVE_CONF,
        now: new Date('2026-10-21T10:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(MintTooSlowError)
    expect(store().commits).toEqual([])
    expect(store().doc('talk-solo')?.feedbackCode).toBeUndefined()
  })

  it('an erased speaker’s own session cannot mint a code again', async () => {
    store().reset([
      {
        _id: 'conf-1',
        _type: 'conference',
        title: 'Conf',
        endDate: '2099-01-01',
      },
      speaker(ADA),
      talk('talk-solo', [ADA]),
    ])
    await erase()
    expect(store().doc('talk-solo')?.feedbackCode).toBeUndefined()
    const commits = store().commits.length

    const minted = await ensureFeedbackCode({
      talkId: 'talk-solo',
      actor: { speakerId: ADA },
      conference: LIVE_CONF,
      now: new Date('2026-10-21T10:00:00.000Z'),
    })

    expect(minted).toEqual({ status: 'refused' })
    expect(store().commits).toHaveLength(commits)
    expect(store().doc('talk-solo')?.feedbackCode).toBeUndefined()
  })

  it('a Submit in flight across the erasure is counted once: the fold waits out Submit’s time limit', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-solo', [ADA]),
      // This device answered green earlier.
      { ...responses('talk-solo', 1)[0], _id: 'device-1', colour: 'green' },
    ])
    // Its Submit re-read the talk (the code was still on it) before the
    // erasure; its write (`createIfNotExists` + patch, as submit.ts sends
    // it) lands while the erasure waits, or else after the erasure ended.
    let landed = false
    const landSubmit = async () => {
      if (landed) return
      landed = true
      const { clientWrite } = await import('@/lib/sanity/client')
      await clientWrite
        .transaction()
        .createIfNotExists({
          _id: 'device-1',
          _type: 'feedbackResponse',
          talk: ref('talk-solo'),
          conference: ref('conf-1'),
          colour: 'yellow',
          submittedAt: '2026-06-10T09:00:00.000Z',
        })
        .patch('device-1', (p) => p.set({ colour: 'yellow' }))
        .commit({ returnDocuments: true })
    }
    const waited: number[] = []

    const result = await eraseSpeakerInPlace({
      speakerId: ADA,
      actor: 'op',
      waitForInFlightSubmits: async (ms) => {
        waited.push(ms)
        await landSubmit()
      },
    })
    await landSubmit()
    // The runbook's re-run.
    await erase()

    expect(result.err).toBeNull()
    // At least Submit's own limit (the /f page's maxDuration, 30 s); then,
    // having folded something, once more before a look that changes nothing.
    expect(waited).toHaveLength(2)
    expect(waited[0]).toBeGreaterThanOrEqual(30_000)
    // One device, one answer: its latest colour.
    expect(folded('talk-solo')).toEqual({ green: 0, yellow: 1, red: 0 })
    expect(live('talk-solo')).toEqual([])
  })

  /** Device D's Submit, admitted before the erasure: lands once, when called. */
  const inFlightSubmit = (talkId: string, colour: string) => {
    let landed = false
    return async () => {
      if (landed) return
      landed = true
      const { clientWrite } = await import('@/lib/sanity/client')
      await clientWrite
        .transaction()
        .createIfNotExists({
          _id: 'device-d',
          _type: 'feedbackResponse',
          talk: ref(talkId),
          conference: ref('conf-1'),
          colour,
          submittedAt: '2026-06-10T09:00:00.000Z',
        })
        .patch('device-d', (p) => p.set({ colour }))
        .commit({ returnDocuments: true })
    }
  }

  it('a second erasure run that starts during the first one’s wait also waits: one device, counted once', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-solo', [ADA]),
      { ...responses('talk-solo', 1)[0], _id: 'device-d', colour: 'green' },
    ])
    const landSubmit = inFlightSubmit('talk-solo', 'yellow')
    const runB = () =>
      eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'op-B',
        // B sees no code (A unset it) but a response to fold: it must wait
        // too, and D's write lands during that wait.
        waitForInFlightSubmits: async () => landSubmit(),
      })

    const runA = await eraseSpeakerInPlace({
      speakerId: ADA,
      actor: 'op-A',
      waitForInFlightSubmits: async () => {
        await runB()
        // If B did not wait, D's write lands only now, after B folded.
        await landSubmit()
      },
    })

    expect(runA.err).toBeNull()
    expect(folded('talk-solo')).toEqual({ green: 0, yellow: 1, red: 0 })
    expect(live('talk-solo')).toEqual([])
  })

  it('a talk with no responses when planned still has a first answer folded that lands during the wait', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-quiet', [ADA]),
    ])
    const landSubmit = inFlightSubmit('talk-quiet', 'red')

    const result = await eraseSpeakerInPlace({
      speakerId: ADA,
      actor: 'op',
      waitForInFlightSubmits: async () => landSubmit(),
    })
    // Had it not waited, the answer would land only now.
    await landSubmit()

    expect(result.err).toBeNull()
    expect(result.plan?.feedbackFoldTalkIds).toEqual([])
    expect(live('talk-quiet')).toEqual([])
    expect(folded('talk-quiet')).toEqual({ green: 0, yellow: 0, red: 1 })
    expect(result.verification?.clean).toBe(true)
  })

  it('a retry right after a crashed run still waits out the window and folds an answer that lands in it', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-quiet', [ADA]),
    ])
    const landSubmit = inFlightSubmit('talk-quiet', 'green')
    // Run A commits the erasure (code unset) and dies before settling.
    const crashed = await eraseSpeakerInPlace({
      speakerId: ADA,
      actor: 'op-A',
      waitForInFlightSubmits: async () => {
        throw new Error('the operator’s laptop went to sleep')
      },
    })
    expect(store().doc(ADA)?.erasedAt).toBeDefined()
    expect(store().doc('talk-quiet')?.feedbackCode).toBeUndefined()
    expect(crashed.err).not.toBeNull()

    // Run B, seconds later: no code to unset, no response yet. It still
    // waits until erasedAt + the settle period, and the answer lands then.
    const waited: number[] = []
    const retry = await eraseSpeakerInPlace({
      speakerId: ADA,
      actor: 'op-B',
      waitForInFlightSubmits: async (ms) => {
        waited.push(ms)
        await landSubmit()
      },
    })
    await landSubmit()

    expect(retry.err).toBeNull()
    // Before the first look, and again after it folded the answer.
    expect(waited).toHaveLength(2)
    expect(waited[0]).toBeGreaterThan(0)
    expect(waited[0]).toBeLessThanOrEqual(FEEDBACK_SETTLE_MS)
    expect(live('talk-quiet')).toEqual([])
    expect(folded('talk-quiet')).toEqual({ green: 1, yellow: 0, red: 0 })
    expect(retry.verification?.clean).toBe(true)
  })

  it('a re-run of an erasure long past still waits a full period before its first look, and folds what it finds', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA, { erasedAt: '2026-01-01T00:00:00.000Z' }),
      talk('talk-solo', [ADA], { feedbackCode: undefined }),
      ...responses('talk-solo', 2),
    ])
    const waited: number[] = []
    const result = await eraseSpeakerInPlace({
      speakerId: ADA,
      actor: 'op',
      waitForInFlightSubmits: async (ms) => void waited.push(ms),
    })
    expect(result.err).toBeNull()
    // Before the first look (when an earlier run closed admission is not
    // stored), and after it, since it folded.
    expect(waited).toHaveLength(2)
    expect(waited[0]).toBeGreaterThan(FEEDBACK_SETTLE_MS - 1_000)
    expect(live('talk-solo')).toEqual([])
  })

  describe('every run waits a full settle period before its first look', () => {
    afterEach(() => vi.useRealTimers())

    it('waits a full period after the erasure’s commit, however long the reads before it took', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const start = new Date('2026-10-21T10:00:00.000Z').getTime()
      vi.setSystemTime(start)
      store().reset([
        { _id: 'conf-1', _type: 'conference', title: 'Conf' },
        speaker(ADA),
        // No code to unset: only the speaker's erasure closes admission
        // (to a mint), when its commit lands.
        talk('talk-quiet', [ADA], { feedbackCode: undefined }),
      ])
      // The gather and the commit took 65 s: erasedAt (the run's start) is
      // already past its window when the commit lands.
      store().beforeNextCommit(() => vi.setSystemTime(start + 65_000))
      const waited: number[] = []

      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'op',
        waitForInFlightSubmits: async (ms) => void waited.push(ms),
      })

      expect(result.err).toBeNull()
      expect(waited).toEqual([FEEDBACK_SETTLE_MS])
    })

    it('a re-run over an old erasedAt waits after its own commit when that commit unsets a code', async () => {
      store().reset([
        { _id: 'conf-1', _type: 'conference', title: 'Conf' },
        speaker(ADA, { erasedAt: '2026-01-01T00:00:00.000Z' }),
        // Its co-speaker's document was deleted since: Ada is alone now.
        talk('talk-was-shared', ['spkgone', ADA]),
      ])
      const waited: number[] = []

      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'op',
        waitForInFlightSubmits: async (ms) => void waited.push(ms),
      })

      expect(result.err).toBeNull()
      expect(store().doc('talk-was-shared')?.feedbackCode).toBeUndefined()
      expect(waited).toHaveLength(1)
      expect(waited[0]).toBeGreaterThan(FEEDBACK_SETTLE_MS - 1_000)
    })

    it('a run that unset a code on an old erasure and crashed: the retry waits a full period and folds the late answer', async () => {
      // Ada was erased long ago; her talk kept its code while Bob spoke on
      // it too. Bob's document has since been deleted.
      store().reset([
        { _id: 'conf-1', _type: 'conference', title: 'Conf' },
        speaker(ADA, { erasedAt: '2026-01-01T00:00:00.000Z' }),
        talk('talk-was-shared', ['spkgone', ADA]),
      ])
      // Run A unsets the code and dies before settling.
      const crashed = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'op-A',
        waitForInFlightSubmits: async () => {
          throw new Error('process killed')
        },
      })
      expect(crashed.err).not.toBeNull()
      expect(store().doc('talk-was-shared')?.feedbackCode).toBeUndefined()

      // Run B has nothing to unset and an old erasedAt; an answer admitted
      // through the code just before A's commit is still on its way.
      const landSubmit = inFlightSubmit('talk-was-shared', 'yellow')
      const waited: number[] = []
      const retry = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'op-B',
        waitForInFlightSubmits: async (ms) => {
          waited.push(ms)
          await landSubmit()
        },
      })
      await landSubmit()

      expect(retry.err).toBeNull()
      expect(waited[0]).toBe(FEEDBACK_SETTLE_MS)
      expect(live('talk-was-shared')).toEqual([])
      expect(folded('talk-was-shared')).toEqual({
        green: 0,
        yellow: 1,
        red: 0,
      })
    })

    it('a retry after a run that crashed right after a slow commit waits a full period from now', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const t0 = new Date('2026-10-21T10:00:00.000Z').getTime()
      vi.setSystemTime(t0)
      store().reset([
        { _id: 'conf-1', _type: 'conference', title: 'Conf' },
        speaker(ADA),
        talk('talk-quiet', [ADA]),
      ])
      // Run A: its reads take 65 s, it commits (erasedAt = its start, t0),
      // and the process dies before settling.
      store().beforeNextCommit(() => vi.setSystemTime(t0 + 65_000))
      const crashed = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'op-A',
        waitForInFlightSubmits: async () => {
          throw new Error('process killed')
        },
      })
      expect(crashed.err).not.toBeNull()

      // Run B at t0 + 66 s: erasedAt + 60 s is past, but admission closed
      // only at t0 + 65 s. B cannot know that, so it waits a full period.
      vi.setSystemTime(t0 + 66_000)
      const landSubmit = inFlightSubmit('talk-quiet', 'green')
      const waited: number[] = []
      const retry = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'op-B',
        waitForInFlightSubmits: async (ms) => {
          waited.push(ms)
          await landSubmit()
        },
      })
      await landSubmit()

      expect(retry.err).toBeNull()
      expect(waited[0]).toBe(FEEDBACK_SETTLE_MS)
      expect(live('talk-quiet')).toEqual([])
      expect(folded('talk-quiet')).toEqual({ green: 1, yellow: 0, red: 0 })
    })

    it('a retry after a run that crashed right after unsetting a late mint’s code waits a full period from now', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const t0 = new Date('2026-10-21T10:00:00.000Z').getTime()
      vi.setSystemTime(t0)
      store().reset([
        { _id: 'conf-1', _type: 'conference', title: 'Conf' },
        speaker(ADA),
        talk('talk-quiet', [ADA], { feedbackCode: undefined }),
      ])
      // Run A: a late mint restores a code during its wait; its look unsets
      // it at t0 + 60 s; the process dies in the next wait.
      let waitsA = 0
      const crashed = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'op-A',
        waitForInFlightSubmits: async () => {
          if (++waitsA === 1) {
            vi.setSystemTime(t0 + 60_000)
            store().put({
              ...talk('talk-quiet', [ADA]),
              feedbackCode: 'LATE23',
              _rev: 'rev-late-mint',
            })
            return
          }
          throw new Error('process killed')
        },
      })
      expect(crashed.err).not.toBeNull()
      expect(store().doc('talk-quiet')?.feedbackCode).toBeUndefined()

      // Run B at t0 + 61 s: an answer admitted through LATE23 is still on
      // its way.
      vi.setSystemTime(t0 + 61_000)
      const landSubmit = inFlightSubmit('talk-quiet', 'red')
      const waited: number[] = []
      const retry = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'op-B',
        waitForInFlightSubmits: async (ms) => {
          waited.push(ms)
          await landSubmit()
        },
      })
      await landSubmit()

      expect(retry.err).toBeNull()
      expect(waited[0]).toBe(FEEDBACK_SETTLE_MS)
      expect(live('talk-quiet')).toEqual([])
      expect(folded('talk-quiet')).toEqual({ green: 0, yellow: 0, red: 1 })
    })
  })

  it('a late mint’s code, and an answer admitted through it, are both caught: it looks again until nothing changes', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-quiet', [ADA]),
    ])
    const landSubmit = inFlightSubmit('talk-quiet', 'yellow')
    let waits = 0
    const result = await eraseSpeakerInPlace({
      speakerId: ADA,
      actor: 'op',
      waitForInFlightSubmits: async () => {
        waits++
        // During the first wait a mint that checked before the erasure
        // puts a code back; an answer admitted through it lands during the
        // wait after the look that unset it.
        if (waits === 1) {
          store().put({
            ...talk('talk-quiet', [ADA]),
            feedbackCode: 'LATE23',
            _rev: 'rev-late-mint',
          })
        }
        if (waits === 2) await landSubmit()
      },
    })
    await landSubmit()

    expect(result.err).toBeNull()
    expect(store().doc('talk-quiet')?.feedbackCode).toBeUndefined()
    expect(live('talk-quiet')).toEqual([])
    expect(folded('talk-quiet')).toEqual({ green: 0, yellow: 1, red: 0 })
    // Unset, then folded, then a look that changed nothing.
    expect(waits).toBe(3)
    expect(result.verification?.clean).toBe(true)
  })

  it('gives up after its looks if something keeps landing: reported, and not CLEAN', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-busy', [ADA]),
    ])
    let n = 0
    const { clientWrite } = await import('@/lib/sanity/client')
    const result = await eraseSpeakerInPlace({
      speakerId: ADA,
      actor: 'op',
      // A new answer lands in every wait.
      waitForInFlightSubmits: async () => {
        await clientWrite
          .transaction()
          .create({ ...responses('talk-busy', 1)[0], _id: `busy-${++n}` })
          .commit()
      },
    })

    expect(n).toBe(MAX_SETTLE_LOOKS)
    expect(result.feedbackFolds).toContainEqual(
      expect.objectContaining({
        talkId: 'talk-busy',
        status: 'failed',
        error: expect.stringContaining('still changing'),
      }),
    )
    expect(result.verification?.clean).toBe(false)
  })

  describe('the look after the wait (adopted from the round-4 test review)', () => {
    const base = () =>
      store().reset([
        { _id: 'conf-1', _type: 'conference', title: 'Conf' },
        speaker(ADA),
        speaker(BOB),
        talk('talk-quiet', [ADA]),
      ])
    /** A late mint puts the code back on the published talk during the wait. */
    const lateMint = async () =>
      store().put({
        ...talk('talk-quiet', [ADA]),
        feedbackCode: 'LATE23',
        _rev: 'rev-late-mint',
      })

    it('sweeps a draft made during its unset commit, without another look', async () => {
      base()
      store().afterNextCommit(() => {}) // the erasure transaction
      store().afterNextCommit(() =>
        store().put({
          ...talk('drafts.talk-quiet', [ADA]),
          feedbackCode: 'LATE23',
          _rev: 'rev-late-draft',
        }),
      )
      let waits = 0
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'op',
        waitForInFlightSubmits: async () => {
          if (++waits === 1) await lateMint()
        },
      })
      expect(result.err).toBeNull()
      expect(store().doc('talk-quiet')?.feedbackCode).toBeUndefined()
      expect(store().doc('drafts.talk-quiet')?.feedbackCode).toBeUndefined()
      // The look that unset the code, then one that found nothing: the
      // sweep fixed the draft, not a third look.
      expect(waits).toBe(2)
    })

    it('a co-speaker added between the fresh look and its unset keeps the talk its code', async () => {
      base()
      store().beforeNextCommit(() => {}) // the erasure transaction
      store().beforeNextCommit(() =>
        store().put({
          ...talk('talk-quiet', [ADA, BOB]),
          feedbackCode: 'LATE23',
          _rev: 'rev-bob-added',
        }),
      )
      // The unset fails its guard and counts as a change, so the run looks
      // again; the late mint happened once.
      let waits = 0
      const result = await eraseSpeakerInPlace({
        speakerId: ADA,
        actor: 'op',
        waitForInFlightSubmits: async () => {
          if (++waits === 1) await lateMint()
        },
      })
      expect(result.err).toBeNull()
      expect(store().doc('talk-quiet')?.feedbackCode).toBe('LATE23')
    })
  })

  it('verification is never CLEAN while responses of a sole talk survive under another conference', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-solo', [ADA]),
      ...responses('talk-solo', 2),
      // Written before the talk was moved here from conf-0.
      {
        ...responses('talk-solo', 1)[0],
        _id: 'moved-r',
        conference: ref('conf-0'),
      },
    ])

    const result = await erase()

    expect(result.err).toBeNull()
    expect(store().doc('moved-r')).toBeDefined()
    expect(result.verification?.residual.feedbackResponses).toBe(1)
    expect(result.verification?.clean).toBe(false)
  })

  it('a locked release version still holding the code, with no responses, keeps verification from CLEAN', async () => {
    h.releases = [{ name: 'rel-s', state: 'scheduled' }]
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-solo', [ADA], { feedbackCode: undefined }),
      { ...talk('versions.rel-s.talk-solo', [ADA]), _rev: 'rev-locked' },
    ])

    const result = await erase()

    expect(result.err).toBeNull()
    expect(store().doc('versions.rel-s.talk-solo')?.feedbackCode).toBe('CODElo')
    expect(result.verification?.residual.feedbackCodes).toBe(1)
    expect(result.verification?.clean).toBe(false)
  })

  it('waits longer than the /f page lets a Submit run', () => {
    const page = readFileSync(
      join(process.cwd(), 'src/app/(public)/f/[code]/page.tsx'),
      'utf8',
    )
    const declared = /^export const maxDuration = (\d+)$/m.exec(page)?.[1]
    expect(Number(declared)).toBe(SUBMIT_MAX_DURATION_S)
    // Comfortably above Submit's own bound, and above the page's limit.
    expect(FEEDBACK_SETTLE_MS).toBeGreaterThanOrEqual(
      SUBMIT_WRITE_BOUND_MS + 30_000,
    )
    expect(FEEDBACK_SETTLE_MS).toBeGreaterThanOrEqual(
      SUBMIT_MAX_DURATION_S * 1000 + 30_000,
    )
    expect(FEEDBACK_SETTLE_MS).toBeGreaterThanOrEqual(
      MINT_WRITE_BOUND_MS + 30_000,
    )
  })

  it('folds nothing of a talk that gained a live co-speaker while the erasure waited', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      speaker(BOB),
      talk('talk-solo', [ADA]),
      ...responses('talk-solo', 3),
    ])

    const result = await eraseSpeakerInPlace({
      speakerId: ADA,
      actor: 'op',
      waitForInFlightSubmits: async () =>
        store().put({
          ...talk('talk-solo', [ADA, BOB]),
          feedbackCode: undefined,
          _rev: 'rev-bob-added',
        }),
    })

    expect(result.err).toBeNull()
    expect(result.feedbackFolds).toEqual([])
    expect(live('talk-solo')).toHaveLength(3)
  })

  it('folds nothing of a talk the subject was removed from after the erasure listed it', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-solo', [ADA]),
      ...responses('talk-solo', 3),
    ])
    // Ada is taken off the talk (it is being reassigned) after the look
    // after the wait listed it, just before the fold's first commit.
    store().beforeNextCommit(() => {}) // the erasure transaction
    store().beforeNextCommit(() =>
      store().put({
        ...talk('talk-solo', []),
        feedbackCode: undefined,
        _rev: 'rev-reassigned',
      }),
    )

    const result = await erase()

    expect(result.err).toBeNull()
    expect(live('talk-solo')).toHaveLength(3)
    expect(result.feedbackFolds).toContainEqual(
      expect.objectContaining({ talkId: 'talk-solo', status: 'ineligible' }),
    )
  })

  it('a late-code unset whose reply was lost still counts as a change: it waits and looks again', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-quiet', [ADA]),
    ])
    const landSubmit = inFlightSubmit('talk-quiet', 'green')
    store().afterNextCommit(() => {}) // the erasure transaction
    // The unset of the late code is applied, but its reply is lost.
    store().afterNextCommit(() => {
      throw new Error('socket hang up')
    })
    let waits = 0
    const result = await eraseSpeakerInPlace({
      speakerId: ADA,
      actor: 'op',
      waitForInFlightSubmits: async () => {
        waits++
        if (waits === 1) {
          store().put({
            ...talk('talk-quiet', [ADA]),
            feedbackCode: 'LATE23',
            _rev: 'rev-late-mint',
          })
        }
        // An answer admitted through the late code lands in the wait after
        // the unset.
        if (waits === 2) await landSubmit()
      },
    })
    await landSubmit()

    expect(result.err).toBeNull()
    expect(store().doc('talk-quiet')?.feedbackCode).toBeUndefined()
    expect(live('talk-quiet')).toEqual([])
    expect(folded('talk-quiet')).toEqual({ green: 1, yellow: 0, red: 0 })
  })

  it('reports a talk that became held during the wait', async () => {
    h.releases = [{ name: 'rel-a', state: 'active' }]
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-solo', [ADA]),
      ...responses('talk-solo', 2),
    ])

    const result = await eraseSpeakerInPlace({
      speakerId: ADA,
      actor: 'op',
      // The release list stops loading while the run waits.
      waitForInFlightSubmits: async () => {
        h.releasesFail = true
      },
    })

    expect(result.err).toBeNull()
    expect(result.plan?.feedbackHeld).toEqual([])
    expect(result.feedbackFolds).toContainEqual(
      expect.objectContaining({ talkId: 'talk-solo', status: 'held' }),
    )
    expect(live('talk-solo')).toHaveLength(2)
    expect(result.verification?.clean).toBe(false)
  })

  it('reports one outcome per talk: a chunk that failed and a later look that folded the rest', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-big', [ADA]),
      ...responses('talk-big', 150),
    ])
    // The erasure, the first chunk, then a lost connection on the second.
    store().beforeNextCommit(() => {})
    store().beforeNextCommit(() => {})
    store().beforeNextCommit(() => {
      throw new Error('socket hang up')
    })

    const result = await erase()

    expect(result.err).toBeNull()
    expect(live('talk-big')).toEqual([])
    expect(result.feedbackFolds).toEqual([
      { talkId: 'talk-big', status: 'folded', responses: 150, error: null },
    ])
  })

  it('expires the speaker’s caches before the settle wait, and again after it', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-solo', [ADA]),
    ])
    const events: string[] = []
    await eraseSpeakerInPlace({
      speakerId: ADA,
      actor: 'op',
      revalidate: (tag) => void events.push(`revalidate ${tag}`),
      waitForInFlightSubmits: async () => void events.push('wait'),
    })
    const first = events.indexOf('revalidate content:speakers')
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(events.indexOf('wait'))
    expect(events.lastIndexOf('revalidate content:speakers')).toBeGreaterThan(
      events.lastIndexOf('wait'),
    )
  })

  it('a look after the wait whose re-read fails reports every talk once, those with only a code too', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-solo', [ADA]),
      talk('talk-quiet', [ADA]),
      ...responses('talk-solo', 3),
    ])
    // The second look's re-read of the responses fails, once.
    let failNext = false
    store().failReadsThat((read) => {
      if (!failNext || !read.query.includes('talk._ref in $talkIds')) {
        return false
      }
      failNext = false
      return true
    })
    let waits = 0
    const result = await eraseSpeakerInPlace({
      speakerId: ADA,
      actor: 'op',
      waitForInFlightSubmits: async () => {
        if (++waits === 2) failNext = true
      },
    })

    expect(result.err).toBeNull()
    const byTalk = Object.fromEntries(
      result.feedbackFolds.map((f) => [f.talkId, f]),
    )
    expect(result.feedbackFolds).toHaveLength(2)
    expect(byTalk['talk-solo']).toMatchObject({
      status: 'failed',
      responses: 3,
    })
    expect(byTalk['talk-quiet']).toMatchObject({ status: 'failed' })
    expect(result.verification?.clean).toBe(false)
  })

  it('folds nothing of a talk whose erased co-speaker is restored between the fold’s check and its commit', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      speaker(CAT, { erasedAt: '2026-01-01T00:00:00.000Z' }),
      talk('talk-was-duo', [CAT, ADA]),
      ...responses('talk-was-duo', 2),
    ])
    store().beforeNextCommit(() => {}) // the erasure transaction
    // Cat's `erasedAt` is taken away by hand while the first chunk commits.
    store().beforeNextCommit(() =>
      store().put({ ...speaker(CAT), _rev: 'rev-restored' }),
    )

    const result = await erase()

    expect(result.err).toBeNull()
    expect(live('talk-was-duo')).toHaveLength(2)
    expect(result.feedbackFolds).toContainEqual(
      expect.objectContaining({ talkId: 'talk-was-duo', status: 'ineligible' }),
    )
  })

  it('expires the code index of the conference a talk moved to during the wait, where a stale code was unset', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      { _id: 'conf-2', _type: 'conference', title: 'Conf 2' },
      speaker(ADA),
      talk('talk-solo', [ADA]),
    ])
    const tags: string[] = []
    let waits = 0
    const result = await eraseSpeakerInPlace({
      speakerId: ADA,
      actor: 'op',
      revalidate: (tag) => void tags.push(tag),
      waitForInFlightSubmits: async () => {
        // Moved to conf-2, and an old version restores its code.
        if (++waits === 1) {
          store().put({
            ...talk('talk-solo', [ADA], { conference: ref('conf-2') }),
            feedbackCode: 'STALE2',
            _rev: 'rev-moved',
          })
        }
      },
    })

    expect(result.err).toBeNull()
    expect(store().doc('talk-solo')?.feedbackCode).toBeUndefined()
    expect(result.cache.tags).toContain('sanity:feedback-code-index-conf-2')
    expect(
      tags.lastIndexOf('sanity:feedback-code-index-conf-2'),
    ).toBeGreaterThan(-1)
  })

  it('a talk held at the last look is reported as held, not failed, when another talk keeps changing', async () => {
    store().reset([
      { _id: 'conf-1', _type: 'conference', title: 'Conf' },
      speaker(ADA),
      talk('talk-busy', [ADA]),
      talk('talk-solo', [ADA]),
      ...responses('talk-solo', 2),
    ])
    let n = 0
    const { clientWrite } = await import('@/lib/sanity/client')
    const result = await eraseSpeakerInPlace({
      speakerId: ADA,
      actor: 'op',
      waitForInFlightSubmits: async () => {
        // talk-solo's copy goes into a release that is then scheduled.
        if (n === 0) {
          h.releases = [{ name: 'rel-s', state: 'scheduled' }]
          store().put({
            ...talk('versions.rel-s.talk-solo', [ADA]),
            _rev: 'rev-locked',
          })
        }
        // A new answer to talk-busy lands in every wait.
        await clientWrite
          .transaction()
          .create({ ...responses('talk-busy', 1)[0], _id: `busy-${++n}` })
          .commit()
      },
    })

    expect(n).toBe(MAX_SETTLE_LOOKS)
    const byTalk = Object.fromEntries(
      result.feedbackFolds.map((f) => [f.talkId, f]),
    )
    expect(byTalk['talk-busy']).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('still changing'),
    })
    expect(byTalk['talk-solo']).toMatchObject({
      status: 'held',
      error: expect.stringContaining('published or archived'),
    })
    expect(live('talk-solo')).toHaveLength(2)
    expect(result.verification?.clean).toBe(false)
  })

  it('a dry run writes nothing and lists the talks it would fold', async () => {
    world()
    const result = await eraseSpeakerInPlace({
      speakerId: ADA,
      actor: 'op',
      dryRun: true,
    })
    expect(store().commits).toEqual([])
    expect(result.plan?.feedbackFoldTalkIds.sort()).toEqual([
      'talk-solo',
      'talk-was-duo',
    ])
  })

  it('verification counts a code left on a talk of the erased speaker', async () => {
    world()
    await erase()
    store().put({ ...talk('talk-solo', [ADA]), feedbackCode: 'BACKAG' })
    const v = await verifySpeakerErasure(ADA)
    expect(v?.clean).toBe(false)
    expect(v?.residual.feedbackCodes).toBe(1)
  })
})
