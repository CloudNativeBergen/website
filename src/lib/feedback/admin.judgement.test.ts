/**
 * @vitest-environment node
 *
 * Jev's advice in the organizers' Session Feedback (Content judgement spec
 * §7.2, §7.3, §8.2): the summary and Keep mark as a talk's panel reads them,
 * the triage counts and filter, and the agreement tally written in the SAME
 * transaction as Keep, Hide and Remove. GROQ is EXECUTED with groq-js and
 * writes are applied by `@sanity/mutator` (`versionedSanityStore`), against a
 * two-conference dataset.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({ store: null as null | VersionedSanityStore }))

vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

import { tallyId } from '@/lib/content-judgement/tally'
import {
  countFlaggedComments,
  hideResponses,
  keepResponse,
  readAdminFeedback,
  readTalkFeedback,
  removeResponses,
  unhideResponses,
} from './admin'

const store = () => h.store!
const ref = (id: string) => ({ _type: 'reference', _ref: id })
const NOW = new Date('2026-10-27T10:14:00.000Z')
const MODEL = 'typesafe/jev-1.14-20261014'
const CONF_A = { _id: 'conf-A', endDate: '2026-10-28' }
const CONF_B = { _id: 'conf-B', endDate: '2026-10-28' }

const judged = (
  reasons: [string, number][],
  extra: Record<string, unknown> = {},
) => ({
  state: 'judged',
  model: MODEL,
  questionSet: 'v2',
  judgedAt: '2026-10-27T09:00:00.000Z',
  reasons: reasons.map(([question, probability]) => ({
    _key: `comment.${question}`,
    part: 'comment',
    question,
    probability,
  })),
  ...extra,
})

const rid = (n: number) => `feedbackResponse-${String(n).padStart(32, '0')}`
const response = (
  n: number,
  talk: string,
  conference: string,
  fields: Record<string, unknown>,
) => ({
  _id: rid(n),
  _type: 'feedbackResponse',
  _rev: `rev-${n}`,
  talk: ref(talk),
  conference: ref(conference),
  colour: 'red',
  comment: `comment ${n}`,
  submittedAt: `2026-10-27T08:${String(n).padStart(2, '0')}:00.000Z`,
  ...fields,
})

/** Jev flagged it: abusive 0.88, personal details 0.61. */
const R_UNSAFE = 1
/** A speaker flagged it; Jev found nothing. */
const R_SPEAKER = 2
/** No Judgement yet. */
const R_UNCHECKED = 3
/** Hidden by an organizer; Jev had flagged it. */
const R_HIDDEN = 4
/** Kept by Kari after Jev flagged personal details (while the setting was off: never tallied). */
const R_KEPT = 5
/** Jev could not judge it: spend cap. */
const R_FAILED = 6
/** Another conference's, flagged like R_UNSAFE's abusive answer. */
const R_FOREIGN = 7

const tallies = () =>
  store()
    .all()
    .filter((d) => d._type === 'judgementTally')
    .map((d) => ({
      question: d.question,
      band: d.band,
      agreed: d.agreed,
      disagreed: d.disagreed,
    }))
    .sort((a, b) => String(a.question).localeCompare(String(b.question)))

beforeEach(() => {
  store().reset([
    { _id: 'sp-org', _type: 'speaker', name: 'Kari' },
    { _id: 'sp-ada', _type: 'speaker', name: 'Ada' },
    {
      _id: 'talk-1',
      _type: 'talk',
      title: 'Talk one',
      status: 'confirmed',
      format: 'presentation_40',
      conference: ref('conf-A'),
      speakers: [ref('sp-ada')],
    },
    {
      _id: 'talk-B',
      _type: 'talk',
      title: 'Talk B',
      status: 'confirmed',
      format: 'presentation_40',
      conference: ref('conf-B'),
      speakers: [ref('sp-ada')],
    },
    response(R_UNSAFE, 'talk-1', 'conf-A', {
      judgement: judged([
        ['abusive', 0.88],
        ['personal_info', 0.61],
      ]),
    }),
    response(R_SPEAKER, 'talk-1', 'conf-A', {
      flaggedAt: '2026-10-27T09:30:00.000Z',
      judgement: judged([]),
    }),
    response(R_UNCHECKED, 'talk-1', 'conf-A', {}),
    response(R_HIDDEN, 'talk-1', 'conf-A', {
      hiddenAt: '2026-10-27T09:40:00.000Z',
      judgement: judged([['abusive', 0.91]]),
    }),
    response(R_KEPT, 'talk-1', 'conf-A', {
      judgement: judged([['personal_info', 0.61]]),
      keptAt: '2026-10-27T09:50:00.000Z',
      keptBy: { ...ref('sp-org'), _weak: true },
    }),
    response(R_FAILED, 'talk-1', 'conf-A', {
      judgement: {
        state: 'notJudged',
        notJudgedWhy: 'spendCap',
        judgedAt: '2026-10-27T09:00:00.000Z',
      },
    }),
    response(R_FOREIGN, 'talk-B', 'conf-B', {
      judgement: judged([['abusive', 0.85]]),
    }),
  ])
})

describe('a talk’s comments with Jev’s advice (§8.2)', () => {
  it('carries the summary and the Keep mark (by name) when the organization has judgement on', async () => {
    const read = (await readTalkFeedback({
      conference: CONF_A,
      talkId: 'talk-1',
      now: NOW,
      judgementOn: true,
    }))!
    const byId = new Map(read.comments.map((c) => [c.id, c]))
    expect(byId.get(rid(R_UNSAFE))).toMatchObject({
      flagged: false,
      judgement: {
        state: 'judged',
        reasons: [
          { question: 'abusive', probability: 0.88 },
          { question: 'personal_info', probability: 0.61 },
        ],
      },
      kept: null,
    })
    expect(byId.get(rid(R_SPEAKER))).toMatchObject({
      flagged: true,
      judgement: { state: 'judged', reasons: [] },
    })
    expect(byId.get(rid(R_UNCHECKED))).toMatchObject({ judgement: null })
    expect(byId.get(rid(R_KEPT))).toMatchObject({
      kept: { by: 'Kari', at: '2026-10-27T09:50:00.000Z' },
    })
    expect(byId.get(rid(R_FAILED))).toMatchObject({
      judgement: { state: 'notJudged', why: 'spendCap' },
    })
    // Nothing of the record beyond §7.2 reaches the page.
    expect(JSON.stringify(byId.get(rid(R_UNSAFE))!.judgement)).not.toContain(
      'talliedAt',
    )
    expect(read.triage).toEqual({
      all: 6,
      speaker: 1,
      unsafe: 1,
      unchecked: 2,
    })
  })

  it('hides stored Judgements and Keep marks while the organization has judgement off (§5)', async () => {
    const read = (await readTalkFeedback({
      conference: CONF_A,
      talkId: 'talk-1',
      now: NOW,
      judgementOn: false,
    }))!
    expect(read.triage).toBeNull()
    expect(read.comments).toHaveLength(6)
    for (const c of read.comments) {
      expect(c.judgement).toBeNull()
      expect(c.kept).toBeNull()
    }
    // The speaker's flag still shows.
    expect(read.comments.find((c) => c.id === rid(R_SPEAKER))?.flagged).toBe(
      true,
    )
  })

  it('filters on the server by the tile the organizer pressed, counts unchanged', async () => {
    const unsafe = (await readTalkFeedback({
      conference: CONF_A,
      talkId: 'talk-1',
      now: NOW,
      judgementOn: true,
      filter: 'unsafe',
    }))!
    expect(unsafe.comments.map((c) => c.id)).toEqual([rid(R_UNSAFE)])
    expect(unsafe.triage).toEqual({
      all: 6,
      speaker: 1,
      unsafe: 1,
      unchecked: 2,
    })
    const unchecked = (await readTalkFeedback({
      conference: CONF_A,
      talkId: 'talk-1',
      now: NOW,
      judgementOn: true,
      filter: 'unchecked',
    }))!
    expect(unchecked.comments.map((c) => c.id)).toEqual([
      rid(R_UNCHECKED),
      rid(R_FAILED),
    ])
    // The chart still has every response.
    expect(unchecked.responses).toHaveLength(6)
  })

  it('applies no triage filter while the organization has judgement off (the strip is gone)', async () => {
    const read = (await readTalkFeedback({
      conference: CONF_A,
      talkId: 'talk-1',
      now: NOW,
      judgementOn: false,
      filter: 'unsafe',
    }))!
    expect(read.comments).toHaveLength(6)
    expect(read.triage).toBeNull()
  })

  it('never shows another conference’s Judgement', async () => {
    const read = (await readTalkFeedback({
      conference: CONF_B,
      talkId: 'talk-B',
      now: NOW,
      judgementOn: true,
    }))!
    expect(read.comments.map((c) => c.id)).toEqual([rid(R_FOREIGN)])
    expect(read.triage).toEqual({
      all: 1,
      speaker: 0,
      unsafe: 1,
      unchecked: 0,
    })
  })
})

describe('the /admin/feedback flagged box and the nav badge stay speaker-flag only (§8.2)', () => {
  it('counts the speaker’s flag and not Jev’s', async () => {
    expect(await countFlaggedComments('conf-A')).toBe(1)
    const overview = await readAdminFeedback({
      conferenceId: 'conf-A',
      now: NOW,
    })
    expect(overview.flagged).toBe(1)
    const session = overview.sessions.find((s) => s.talkId === 'talk-1')!
    expect(session.comments.filter((c) => c.flagged).map((c) => c.id)).toEqual([
      rid(R_SPEAKER),
    ])
    // The overview carries no advice: Jev's flags never read as complaints there.
    for (const c of session.comments) expect(c.judgement).toBeNull()
  })
})

describe('Keep records who and when, and tallies a disagreement (§7.3, §8.2)', () => {
  it('sets keptAt/keptBy and increments disagreed for every flagged question in its band, in ONE transaction', async () => {
    const result = await keepResponse({
      conferenceId: 'conf-A',
      responseId: rid(R_UNSAFE),
      seenRev: `rev-${R_UNSAFE}`,
      keptBy: 'sp-org',
      now: NOW,
      tally: true,
    })
    expect(result).toEqual({ status: 'kept' })
    expect(store().commits).toHaveLength(1)
    const doc = store().doc(rid(R_UNSAFE))!
    expect(doc.keptAt).toBe(NOW.toISOString())
    expect(doc.keptBy).toEqual({ ...ref('sp-org'), _weak: true })
    expect(doc.flaggedAt).toBeUndefined()
    expect((doc.judgement as { talliedAt?: string }).talliedAt).toBe(
      NOW.toISOString(),
    )
    expect(tallies()).toEqual([
      { question: 'abusive', band: '0.5-0.9', agreed: 0, disagreed: 1 },
      { question: 'personal_info', band: '0.5-0.9', agreed: 0, disagreed: 1 },
    ])
    const [tally] = store()
      .all()
      .filter((d) => d._type === 'judgementTally')
    expect(tally._id).toBe(
      tallyId({
        surface: 'feedbackComment',
        model: MODEL,
        questionSet: 'v2',
        question: 'abusive',
        band: '0.5-0.9',
      }),
    )
    expect(JSON.stringify(tally)).not.toMatch(/conf-|feedbackResponse-|sp-org/)
  })

  it('a Keep on a comment Jev did not flag records the mark and counts nothing', async () => {
    await keepResponse({
      conferenceId: 'conf-A',
      responseId: rid(R_SPEAKER),
      seenRev: `rev-${R_SPEAKER}`,
      keptBy: 'sp-org',
      now: NOW,
      tally: true,
    })
    const doc = store().doc(rid(R_SPEAKER))!
    expect(doc.flaggedAt).toBeUndefined()
    expect(doc.keptAt).toBe(NOW.toISOString())
    expect(tallies()).toEqual([])
  })

  it('a refused Keep (revision changed) writes nothing, tally included', async () => {
    const result = await keepResponse({
      conferenceId: 'conf-A',
      responseId: rid(R_UNSAFE),
      seenRev: 'rev-stale',
      keptBy: 'sp-org',
      now: NOW,
      tally: true,
    })
    // Jev's advice is still open: "look at it again", never "already handled".
    expect(result).toEqual({ status: 'changed', now: 'flagged' })
    expect(store().commits).toHaveLength(0)
    expect(tallies()).toEqual([])
  })

  it('a refused Keep on advice a Hide tallied and an Unhide reopened still says look again', async () => {
    await hideResponses({
      conferenceId: 'conf-A',
      responseIds: [rid(R_UNSAFE)],
      now: NOW,
      tally: true,
    })
    await unhideResponses({
      conferenceId: 'conf-A',
      responseIds: [rid(R_UNSAFE)],
    })
    const result = await keepResponse({
      conferenceId: 'conf-A',
      responseId: rid(R_UNSAFE),
      seenRev: 'rev-stale',
      keptBy: 'sp-org',
      now: NOW,
      tally: true,
    })
    expect(result).toEqual({ status: 'changed', now: 'flagged' })
  })

  it('a refused Keep while the organization has judgement off never cites advice it does not show', async () => {
    const result = await keepResponse({
      conferenceId: 'conf-A',
      responseId: rid(R_UNSAFE),
      seenRev: 'rev-stale',
      keptBy: 'sp-org',
      now: NOW,
      tally: false,
    })
    expect(result).toEqual({ status: 'changed', now: 'unflagged' })
  })

  it('a refused Keep on a comment another organizer kept since says it is handled', async () => {
    const result = await keepResponse({
      conferenceId: 'conf-A',
      responseId: rid(R_KEPT),
      seenRev: 'rev-stale',
      keptBy: 'sp-org',
      now: NOW,
      tally: true,
    })
    expect(result).toEqual({ status: 'changed', now: 'unflagged' })
  })

  it('a refused Keep on a comment Jev found nothing in, unflagged since, says it is handled', async () => {
    store().put({
      ...store().doc(rid(R_SPEAKER))!,
      _rev: 'rev-reworded',
      flaggedAt: undefined,
    })
    const result = await keepResponse({
      conferenceId: 'conf-A',
      responseId: rid(R_SPEAKER),
      seenRev: `rev-${R_SPEAKER}`,
      keptBy: 'sp-org',
      now: NOW,
      tally: true,
    })
    expect(result).toEqual({ status: 'changed', now: 'unflagged' })
  })

  it('with the organization’s judgement off, Keep records the mark but counts nothing', async () => {
    await keepResponse({
      conferenceId: 'conf-A',
      responseId: rid(R_UNSAFE),
      seenRev: `rev-${R_UNSAFE}`,
      keptBy: 'sp-org',
      now: NOW,
      tally: false,
    })
    expect(store().doc(rid(R_UNSAFE))!.keptAt).toBe(NOW.toISOString())
    expect(tallies()).toEqual([])
  })
})

describe('Hide and Remove tally an agreement, once per comment (§7.3)', () => {
  it('Hide increments agreed for every flagged question and marks the Judgement tallied', async () => {
    const result = await hideResponses({
      conferenceId: 'conf-A',
      responseIds: [rid(R_UNSAFE), rid(R_SPEAKER), rid(R_UNCHECKED)],
      now: NOW,
      tally: true,
    })
    expect(result).toEqual({ status: 'ok', count: 3 })
    expect(store().commits).toHaveLength(1)
    expect(tallies()).toEqual([
      { question: 'abusive', band: '0.5-0.9', agreed: 1, disagreed: 0 },
      { question: 'personal_info', band: '0.5-0.9', agreed: 1, disagreed: 0 },
    ])
    expect(
      (store().doc(rid(R_UNSAFE))!.judgement as { talliedAt?: string })
        .talliedAt,
    ).toBe(NOW.toISOString())
    for (const n of [R_UNSAFE, R_SPEAKER, R_UNCHECKED])
      expect(store().doc(rid(n))!.hiddenAt).toBe(NOW.toISOString())
  })

  it('a second decision on the same comment counts nothing more', async () => {
    await keepResponse({
      conferenceId: 'conf-A',
      responseId: rid(R_UNSAFE),
      seenRev: `rev-${R_UNSAFE}`,
      keptBy: 'sp-org',
      now: NOW,
      tally: true,
    })
    await hideResponses({
      conferenceId: 'conf-A',
      responseIds: [rid(R_UNSAFE)],
      now: NOW,
      tally: true,
    })
    await unhideResponses({
      conferenceId: 'conf-A',
      responseIds: [rid(R_UNSAFE)],
    })
    await hideResponses({
      conferenceId: 'conf-A',
      responseIds: [rid(R_UNSAFE)],
      now: NOW,
      tally: true,
    })
    await removeResponses({
      conferenceId: 'conf-A',
      responses: [
        { id: rid(R_UNSAFE), submittedAt: `2026-10-27T08:01:00.000Z` },
      ],
      tally: true,
    })
    expect(tallies()).toEqual([
      { question: 'abusive', band: '0.5-0.9', agreed: 0, disagreed: 1 },
      { question: 'personal_info', band: '0.5-0.9', agreed: 0, disagreed: 1 },
    ])
  })

  it('Hide, Unhide, Hide counts once', async () => {
    for (let i = 0; i < 2; i++) {
      await hideResponses({
        conferenceId: 'conf-A',
        responseIds: [rid(R_UNSAFE)],
        now: NOW,
        tally: true,
      })
      await unhideResponses({
        conferenceId: 'conf-A',
        responseIds: [rid(R_UNSAFE)],
      })
    }
    expect(tallies()).toEqual([
      { question: 'abusive', band: '0.5-0.9', agreed: 1, disagreed: 0 },
      { question: 'personal_info', band: '0.5-0.9', agreed: 1, disagreed: 0 },
    ])
  })

  it('a Keep landing under a Hide is seen: the Hide re-plans and counts nothing', async () => {
    store().beforeNextCommit(() => {
      const doc = store().doc(rid(R_UNSAFE))!
      store().put({
        ...doc,
        _rev: 'rev-kept-meanwhile',
        keptAt: '2026-10-27T10:13:00.000Z',
        keptBy: { ...ref('sp-org'), _weak: true },
        judgement: {
          ...(doc.judgement as object),
          talliedAt: '2026-10-27T10:13:00.000Z',
        },
      })
    })
    const result = await hideResponses({
      conferenceId: 'conf-A',
      responseIds: [rid(R_UNSAFE), rid(R_UNCHECKED)],
      now: NOW,
      tally: true,
    })
    expect(result).toEqual({ status: 'ok', count: 2 })
    expect(store().doc(rid(R_UNSAFE))!.hiddenAt).toBe(NOW.toISOString())
    expect(store().doc(rid(R_UNCHECKED))!.hiddenAt).toBe(NOW.toISOString())
    expect(tallies()).toEqual([])
  })

  it('an already-kept comment counts nothing when hidden', async () => {
    await hideResponses({
      conferenceId: 'conf-A',
      responseIds: [rid(R_KEPT)],
      now: NOW,
      tally: true,
    })
    expect(tallies()).toEqual([])
  })

  it('with the organization’s judgement off, Hide hides and counts nothing', async () => {
    await hideResponses({
      conferenceId: 'conf-A',
      responseIds: [rid(R_UNSAFE)],
      now: NOW,
      tally: false,
    })
    expect(store().doc(rid(R_UNSAFE))!.hiddenAt).toBe(NOW.toISOString())
    expect(tallies()).toEqual([])
  })

  it('Remove, a comment and a range alike, tallies the flagged ones in the delete’s own transaction', async () => {
    const result = await removeResponses({
      conferenceId: 'conf-A',
      responses: [
        { id: rid(R_UNSAFE), submittedAt: `2026-10-27T08:01:00.000Z` },
        { id: rid(R_UNCHECKED), submittedAt: `2026-10-27T08:03:00.000Z` },
        { id: rid(R_HIDDEN), submittedAt: `2026-10-27T08:04:00.000Z` },
        // Another conference's: skipped, never written, never tallied.
        { id: rid(R_FOREIGN), submittedAt: `2026-10-27T08:07:00.000Z` },
      ],
      range: {
        from: '2026-10-27T08:00:00.000Z',
        to: '2026-10-27T09:00:00.000Z',
      },
      tally: true,
    })
    expect(result).toEqual({ status: 'ok', removed: 3, gone: 1, changed: 0 })
    expect(store().commits).toHaveLength(1)
    expect(store().doc(rid(R_FOREIGN))).toBeDefined()
    // R_UNSAFE's two answers, and R_HIDDEN's abusive 0.91 in the upper band.
    expect(tallies()).toEqual([
      { question: 'abusive', band: '0.5-0.9', agreed: 1, disagreed: 0 },
      { question: 'abusive', band: '0.9-1', agreed: 1, disagreed: 0 },
      { question: 'personal_info', band: '0.5-0.9', agreed: 1, disagreed: 0 },
    ])
  })

  it('a re-planned Remove (a revision guard lost) still tallies only what it deletes', async () => {
    // R_UNCHECKED is answered again under the organizer's confirmation.
    store().beforeNextCommit(() => {
      store().put({
        ...store().doc(rid(R_UNCHECKED))!,
        _rev: 'rev-again',
        colour: 'green',
      })
    })
    const result = await removeResponses({
      conferenceId: 'conf-A',
      responses: [
        { id: rid(R_UNSAFE), submittedAt: `2026-10-27T08:01:00.000Z` },
        { id: rid(R_UNCHECKED), submittedAt: `2026-10-27T08:03:00.000Z` },
      ],
      tally: true,
    })
    expect(result).toEqual({ status: 'ok', removed: 1, gone: 0, changed: 1 })
    expect(tallies()).toEqual([
      { question: 'abusive', band: '0.5-0.9', agreed: 1, disagreed: 0 },
      { question: 'personal_info', band: '0.5-0.9', agreed: 1, disagreed: 0 },
    ])
  })

  it('the tally is platform-wide: two conferences’ decisions land on one document', async () => {
    await keepResponse({
      conferenceId: 'conf-A',
      responseId: rid(R_UNSAFE),
      seenRev: `rev-${R_UNSAFE}`,
      keptBy: 'sp-org',
      now: NOW,
      tally: true,
    })
    await hideResponses({
      conferenceId: 'conf-B',
      responseIds: [rid(R_FOREIGN)],
      now: NOW,
      tally: true,
    })
    expect(tallies()).toEqual([
      { question: 'abusive', band: '0.5-0.9', agreed: 1, disagreed: 1 },
      { question: 'personal_info', band: '0.5-0.9', agreed: 0, disagreed: 1 },
    ])
  })
})
