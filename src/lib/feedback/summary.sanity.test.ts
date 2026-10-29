/**
 * @vitest-environment node
 *
 * THE SUMMARY (speaker feedback spec §11.1, #1437), against
 * `versionedSanityStore`: the selection query runs through groq-js, the claim
 * and the bell are built by the real `@sanity/client` transaction and applied
 * with `@sanity/mutator`, with revision guards and the API-version rule for
 * `versions.**`. Only the email (Resend) and the pause between sends are
 * replaced, at their module boundary.
 *
 * Adversarial fixture: the due talk also sits, later, on a DRAFT schedule, a
 * `drafts.` copy of the official one and another tenant's schedule, each of
 * which would keep its window open if it counted.
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
  /** Speaker reads through the doc endpoint reject once a claim has landed. */
  speakerReadsFailAfterClaim: false,
  /** The options of every doc-endpoint read of speakers. */
  speakerReadOptions: [] as unknown[],
  /** The options of every doc-endpoint read of `talk-1`. */
  talkReadOptions: [] as unknown[],
  /** Doc-endpoint reads of these ids reject: a 5xx for one tenant. */
  failDocReadsOf: [] as string[],
  /** Every doc-endpoint read tried, failed ones too. */
  docReadsTried: [] as string[],
  /** Doc-endpoint reads of these ids never answer, until their signal aborts. */
  hangDocReadsOf: [] as string[],
  /** Runs before each doc-endpoint read: a write landing just then. */
  beforeDocRead: null as null | ((id: string) => void),
  /** The options of every read on the uncached read client. */
  uncachedReadOptions: [] as unknown[],
  /** Runs before each doc-endpoint read of speakers: a write landing then. */
  beforeSpeakerRead: null as null | ((ids: string[]) => void),
  sendEmail: vi.fn(),
  resolveSender: vi.fn(),
  lastTransactionId: undefined as string | undefined,
  /** Every config a client was made with (the pinned API version, a timeout). */
  clientConfigs: [] as Record<string, unknown>[],
  /** The pause between sends: recorded, and immediate. */
  delay: vi.fn(async (ms: number) => void ms),
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  const clients = h.store.clients as {
    clientReadUncached: unknown
    clientReadCached: unknown
    clientWrite: Writer & { withConfig: (c: { apiVersion: string }) => Writer }
  }
  // groq-js has no `releases::all()`: answered here, as production does
  // (MEASURED 2026-10-19: `[]` with the projection, null without).
  const withReleases = (w: Writer): Writer => ({
    ...w,
    // The id of the last transaction built, for a test to land it late.
    transaction: () => {
      const tx = (w.transaction as () => { transactionId(): string })()
      const commit = (tx as unknown as { commit: () => Promise<unknown> })
        .commit
      ;(tx as unknown as { commit: () => Promise<unknown> }).commit = () => {
        h.lastTransactionId = tx.transactionId()
        return commit()
      }
      return tx
    },
    getDocument: async (id: string, options?: unknown) => {
      if (id === 'talk-1') h.talkReadOptions.push(options)
      h.docReadsTried.push(id)
      if (h.failDocReadsOf.includes(id)) throw new Error('503 (test)')
      h.beforeDocRead?.(id)
      if (h.hangDocReadsOf.includes(id)) {
        const signal = (options as { signal?: AbortSignal } | undefined)?.signal
        return new Promise((_, reject) =>
          signal?.addEventListener('abort', () => reject(signal.reason)),
        )
      }
      return (w.getDocument as (id: string) => Promise<unknown>)(id)
    },
    getDocuments: async (ids: string[], options?: unknown) => {
      if (ids.some((id) => id.startsWith('sp-'))) {
        h.speakerReadOptions.push(options)
        h.beforeSpeakerRead?.(ids)
      }
      if (
        h.speakerReadsFailAfterClaim &&
        ids.some((id) => id.startsWith('sp-')) &&
        h.store!.doc('talk-1')?.feedbackSummarySentAt
      ) {
        throw new Error('503: read refused (test)')
      }
      return (w.getDocuments as (ids: string[]) => Promise<unknown>)(ids)
    },
    fetch: async (query, params, options) => {
      if (!query.includes('releases::all()')) {
        return w.fetch(query, params, options)
      }
      if (h.releasesFail) throw new Error('503 releases unavailable')
      if (h.releases.length === 0 && !query.includes('releases::all()[]'))
        return null
      return h.releases.map((r) => ({
        _id: `_.releases.${r.name}`,
        state: r.state,
      }))
    },
  })
  const uncached = clients.clientReadUncached as Writer
  return {
    ...clients,
    clientReadUncached: {
      ...uncached,
      fetch: (
        query: string,
        params?: Record<string, unknown>,
        options?: Record<string, unknown>,
      ) => {
        h.uncachedReadOptions.push(options)
        return uncached.fetch(query, params, options)
      },
    },
    clientWrite: {
      ...clients.clientWrite,
      withConfig: (c: { apiVersion: string }) => {
        h.clientConfigs.push(c)
        return withReleases(clients.clientWrite.withConfig(c))
      },
    },
  }
})

vi.mock('@/lib/email/feedback-summary', async (original) => ({
  // The pure refusal classifier stays real; the sends and the sender are
  // the boundary.
  ...(await original<typeof import('@/lib/email/feedback-summary')>()),
  sendFeedbackSummaryEmail: (...args: unknown[]) => h.sendEmail(...args),
  resolveFeedbackSummarySender: (...args: unknown[]) =>
    h.resolveSender(...args),
}))

vi.mock('@/lib/email/config', async (original) => ({
  ...(await original<typeof import('@/lib/email/config')>()),
  delay: (ms: number) => h.delay(ms),
}))

import { runGroq } from '../../../__tests__/helpers/sanityStore'
import { EMAIL_CONFIG } from '@/lib/email/config'
import {
  DUE_TALKS,
  deliverFeedbackSummaries,
  findDueFeedbackSummaries,
} from './summary'

const store = () => h.store!
const ref = (id: string) => ({ _type: 'reference', _ref: id })

/** 10:00 in Oslo on 2026-06-12: the conference (06-10 to 06-11) is over. */
const NOW = new Date('2026-06-12T08:00:00.000Z')
/** A later run, while `talk-open`'s window is still open. */
const LATER = new Date('2026-06-12T12:00:00.000Z')

const CONF_A = {
  _id: 'conf-A',
  _type: 'conference',
  title: 'Conf A',
  organizer: 'Conf A Org',
  cfpEmail: 'cfp@a.example.com',
  domains: ['a.example.com'],
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-06-10',
  endDate: '2026-06-11',
  organization: ref('org-A'),
}
const CONF_B = {
  ...CONF_A,
  _id: 'conf-B',
  title: 'Conf B',
  cfpEmail: 'cfp@b.example.com',
  domains: ['b.example.com'],
  organization: ref('org-B'),
}

const talk = (id: string, conference: string, extra: Doc | object = {}) => ({
  _id: id,
  _type: 'talk',
  _rev: `rev-${id}`,
  conference: ref(conference),
  status: 'confirmed',
  title: `Title of ${id}`,
  speakers: [{ ...ref('sp-1'), _key: 'k1' }],
  ...extra,
})

const speaker = (id: string, extra: object = {}) => ({
  _id: id,
  _type: 'speaker',
  _rev: `rev-${id}`,
  name: `Name ${id}`,
  email: `${id}@example.com`,
  ...extra,
})

let responseCount = 0
const response = (
  talkId: string,
  conference: string,
  colour: string,
  extra: object = {},
  id = `resp-${++responseCount}`,
) => ({
  _id: id,
  _type: 'feedbackResponse',
  _rev: `rev-${id}`,
  talk: ref(talkId),
  conference: ref(conference),
  colour,
  submittedAt: '2026-06-10T08:00:00.000Z',
  ...extra,
})

const day = (
  id: string,
  conference: string,
  date: string,
  status: string,
  slots: [string, string, string][],
) => ({
  _id: id,
  _type: 'schedule',
  conference: ref(conference),
  date,
  status,
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

/**
 * - `talk-1`: due. Last official slot 2026-06-10 09:40 Oslo, so its window
 *   closed 2026-06-11 07:40Z.
 * - `talk-open`: on the official schedule 2026-06-11 14:00, so its window is
 *   open until 2026-06-12 12:40Z.
 */
function seed(extra: Doc[] = []) {
  store().reset([
    CONF_A,
    CONF_B,
    speaker('sp-1'),
    speaker('sp-2'),
    speaker('sp-erased', { erasedAt: '2026-06-01T00:00:00.000Z' }),
    speaker('sp-b'),
    talk('talk-1', 'conf-A', {
      speakers: [
        { ...ref('sp-1'), _key: 'k1' },
        { ...ref('sp-2'), _key: 'k2' },
        { ...ref('sp-erased'), _key: 'k3' },
      ],
      audienceFeedback: { greenCount: 3, yellowCount: 0, redCount: 1 },
    }),
    talk('talk-open', 'conf-A'),
    day('day-1', 'conf-A', '2026-06-10', 'official', [
      ['talk-1', '09:00', '09:40'],
    ]),
    day('day-2', 'conf-A', '2026-06-11', 'official', [
      ['talk-open', '14:00', '14:40'],
    ]),
    // Each of these would keep talk-1 open past NOW if it counted.
    day('day-draft', 'conf-A', '2026-06-12', 'draft', [
      ['talk-1', '09:00', '09:40'],
    ]),
    day('drafts.day-1', 'conf-A', '2026-06-12', 'official', [
      ['talk-1', '09:00', '09:40'],
    ]),
    day('day-B', 'conf-B', '2026-06-12', 'official', [
      ['talk-1', '09:00', '09:40'],
    ]),
    response('talk-1', 'conf-A', 'green', {
      comment: 'SECRET-visible great talk',
    }),
    response('talk-1', 'conf-A', 'green'),
    response('talk-1', 'conf-A', 'yellow', { comment: '   ' }),
    response('talk-1', 'conf-A', 'red', {
      comment: 'SECRET-hidden rude remark',
      hiddenAt: '2026-06-10T09:00:00.000Z',
    }),
    response('talk-open', 'conf-A', 'green'),
    ...extra,
  ])
}

const sentAt = (id: string) => store().doc(id)?.feedbackSummarySentAt
const notifications = () =>
  store()
    .all()
    .filter((d) => d._type === 'notification')
const emailsTo = () =>
  h.sendEmail.mock.calls.map(([arg]) => (arg as { to: string }).to)

/** mergeSpeakers, in one transaction: `talk-1` names `kept` for `gone`. */
const merge = (gone: string, kept: string, extra: object = {}) => {
  store().put(speaker(kept, extra))
  const t = store().doc('talk-1')!
  store().put({
    ...t,
    _rev: `rev-merged-${kept}`,
    speakers: (t.speakers as { _ref: string; _key: string }[]).map((s) =>
      s._ref === gone ? { ...ref(kept), _key: s._key } : s,
    ),
  })
  store().remove(gone)
}

beforeEach(() => {
  h.releases = []
  h.releasesFail = false
  h.speakerReadsFailAfterClaim = false
  h.speakerReadOptions = []
  h.talkReadOptions = []
  h.beforeSpeakerRead = null
  h.failDocReadsOf = []
  h.docReadsTried = []
  h.hangDocReadsOf = []
  h.beforeDocRead = null
  h.uncachedReadOptions = []
  h.sendEmail.mockReset()
  h.sendEmail.mockResolvedValue(undefined)
  h.delay.mockClear()
  h.clientConfigs = []
  h.lastTransactionId = undefined
  h.delay.mockImplementation(async (ms: number) => void ms)
  h.resolveSender.mockReset()
  // One Resend account per organization, as the tenant's own is; the From
  // is the conference's.
  h.resolveSender.mockImplementation(
    async (conference: {
      organization?: { _ref?: string }
      cfpEmail?: string
    }) => {
      const account = `sender-${conference.organization?._ref}`
      // As the real key: the account and the From, which names an address.
      return { account, key: `${account}|Org <${conference.cfpEmail}>` }
    },
  )
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  seed()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('findDueFeedbackSummaries: which talks are summarized', () => {
  const dueIds = async () =>
    (await findDueFeedbackSummaries(NOW)).map((d) => d.talkId).sort()

  it('picks a confirmed talk whose window closed and that has an answer, once', async () => {
    store().put({ ...talk('drafts.talk-1', 'conf-A') })
    expect(await dueIds()).toEqual(['talk-1'])
    const [due] = await findDueFeedbackSummaries(NOW)
    expect(due).toMatchObject({ talkId: 'talk-1', conferenceId: 'conf-A' })
  })

  it('leaves out a talk whose window is still open', async () => {
    expect(await dueIds()).not.toContain('talk-open')
    const later = new Date('2026-06-12T12:40:00.000Z')
    expect(
      (await findDueFeedbackSummaries(later)).map((d) => d.talkId).sort(),
    ).toEqual(['talk-1', 'talk-open'])
  })

  it('leaves out a talk already summarized', async () => {
    store().put({
      ...talk('talk-1', 'conf-A'),
      feedbackSummarySentAt: '2026-06-11T08:00:00.000Z',
    })
    expect(await dueIds()).toEqual([])
  })

  it('leaves out a talk with no answer, or whose only answers are drafts or release copies', async () => {
    seed([
      talk('talk-none', 'conf-A'),
      talk('talk-draft-answer', 'conf-A'),
      response('talk-draft-answer', 'conf-A', 'green', {}, 'drafts.resp-draft'),
      response(
        'talk-draft-answer',
        'conf-A',
        'green',
        {},
        'versions.r1.resp-version',
      ),
      day('day-3', 'conf-A', '2026-06-10', 'official', [
        ['talk-none', '10:00', '10:40'],
        ['talk-draft-answer', '11:00', '11:40'],
      ]),
    ])
    expect(await dueIds()).toEqual(['talk-1'])
  })

  it('needs its own published-only filters: run over every document, drafts and release copies included, it still picks one published talk', async () => {
    // What a `raw` read would see. The default API version hides
    // `versions.**` from the selection read anyway; the filters must not
    // rest on that.
    seed([
      talk('drafts.talk-1', 'conf-A'),
      talk('versions.r1.talk-1', 'conf-A'),
      talk('talk-v', 'conf-A'),
      response('talk-v', 'conf-A', 'green', {}, 'versions.r1.resp-v'),
      response('talk-v', 'conf-A', 'green', {}, 'drafts.resp-v'),
      talk('drafts.talk-d', 'conf-A'),
      response('drafts.talk-d', 'conf-A', 'green'),
    ])
    const rows = (await runGroq(store().all(), DUE_TALKS)) as {
      _id: string
    }[]
    expect(rows.map((r) => r._id).sort()).toEqual(['talk-1', 'talk-open'])
  })

  it('leaves out a talk that is not confirmed', async () => {
    store().put({ ...talk('talk-1', 'conf-A'), status: 'withdrawn' })
    expect(await dueIds()).toEqual([])
  })

  it('counts only an answer of the talk’s own conference', async () => {
    seed([
      talk('talk-x', 'conf-A'),
      response('talk-x', 'conf-B', 'green'),
      day('day-3', 'conf-A', '2026-06-10', 'official', [
        ['talk-x', '10:00', '10:40'],
      ]),
    ])
    expect(await dueIds()).toEqual(['talk-1'])
  })

  it('reads each talk’s window from its own conference’s schedule', async () => {
    // conf-A's schedule puts talk-b in a slot that is still open; it must
    // not count for a conf-B talk.
    seed([
      talk('talk-b', 'conf-B', { speakers: [{ ...ref('sp-b'), _key: 'k' }] }),
      response('talk-b', 'conf-B', 'red'),
      day('day-B1', 'conf-B', '2026-06-10', 'official', [
        ['talk-b', '10:00', '10:40'],
      ]),
      day('day-A3', 'conf-A', '2026-06-12', 'official', [
        ['talk-b', '10:00', '10:40'],
      ]),
    ])
    const due = await findDueFeedbackSummaries(NOW)
    expect(due.map((d) => [d.talkId, d.conferenceId]).sort()).toEqual([
      ['talk-1', 'conf-A'],
      ['talk-b', 'conf-B'],
    ])
  })

  it('picks an unscheduled talk with answers once its conference is over, not before', async () => {
    seed([
      talk('talk-gone', 'conf-A'),
      response('talk-gone', 'conf-A', 'green'),
    ])
    expect(await dueIds()).toEqual(['talk-1', 'talk-gone'])
    // 2026-06-11 23:00Z: talk-1 has closed, the conference is not over.
    const duringLastDay = new Date('2026-06-11T23:00:00.000Z')
    expect(
      (await findDueFeedbackSummaries(duringLastDay)).map((d) => d.talkId),
    ).toEqual(['talk-1'])
  })
})

describe('deliverFeedbackSummaries: claim, then send', () => {
  it('claims the talk before anything is sent, then sends one bell and one email per live speaker', async () => {
    const order: string[] = []
    h.sendEmail.mockImplementation(async () => {
      order.push(`email:${String(sentAt('talk-1'))}`)
    })

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBe(NOW.toISOString())
    // Every email went out after the claim had landed.
    expect(order).toEqual([
      `email:${NOW.toISOString()}`,
      `email:${NOW.toISOString()}`,
    ])
    expect(emailsTo().sort()).toEqual(['sp-1@example.com', 'sp-2@example.com'])
    expect(
      notifications()
        .map((n) => n._id)
        .sort(),
    ).toEqual([
      'notification.feedback-summary.talk-1.sp-1',
      'notification.feedback-summary.talk-1.sp-2',
    ])
    expect(report).toMatchObject({ due: 1, claimed: 1, emailed: 2 })
  })

  it('tells counts only: per-colour totals with Card Counts, responses and visible comments, never comment text', async () => {
    await deliverFeedbackSummaries({ now: NOW })

    const bell = store().doc('notification.feedback-summary.talk-1.sp-1')
    expect(bell).toMatchObject({
      notificationType: 'session_feedback_summary',
      title: 'Your Session Feedback for “Title of talk-1”',
      // Scanned 2 green, 1 yellow, 1 red, plus cards 3 green and 1 red.
      message:
        'Loved it 5 · It was OK 1 · Not for me 2. 8 responses, 1 comment.',
      link: '/cfp/proposal/talk-1#session-feedback',
      recipient: { _type: 'reference', _ref: 'sp-1', _weak: true },
      conference: { _type: 'reference', _ref: 'conf-A' },
      relatedProposal: { _type: 'reference', _ref: 'talk-1', _weak: true },
    })

    const [email] = h.sendEmail.mock.calls[0] as [Record<string, unknown>]
    expect(email).toMatchObject({
      talkId: 'talk-1',
      speakerId: 'sp-1',
      to: 'sp-1@example.com',
      speakerName: 'Name sp-1',
      talkTitle: 'Title of talk-1',
      comments: 1,
      resultsUrl: 'https://a.example.com/cfp/proposal/talk-1#session-feedback',
      totals: {
        combined: { green: 5, yellow: 1, red: 2 },
        scanned: { green: 2, yellow: 1, red: 1 },
        cards: { green: 3, yellow: 0, red: 1 },
        total: 8,
      },
      conference: expect.objectContaining({ _id: 'conf-A' }),
    })

    const everything = JSON.stringify([notifications(), h.sendEmail.mock.calls])
    expect(everything).not.toContain('SECRET')
  })

  it('skips an erased speaker: no bell, no email', async () => {
    await deliverFeedbackSummaries({ now: NOW })
    expect(emailsTo()).not.toContain('sp-erased@example.com')
    expect(
      store().doc('notification.feedback-summary.talk-1.sp-erased'),
    ).toBeUndefined()
  })

  it('sends nothing on the next run', async () => {
    await deliverFeedbackSummaries({ now: NOW })
    h.sendEmail.mockClear()
    const commits = store().commits.length

    const report = await deliverFeedbackSummaries({
      now: LATER,
    })

    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(store().commits.length).toBe(commits)
    expect(sentAt('talk-1')).toBe(NOW.toISOString())
    expect(report).toMatchObject({ due: 0, claimed: 0, emailed: 0 })
  })

  it('logs a failed email and never sends that talk again; the other speaker still gets theirs', async () => {
    h.sendEmail.mockImplementation(async ({ to }: { to: string }) => {
      if (to === 'sp-1@example.com') throw new Error('422 bad address')
    })

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(emailsTo().sort()).toEqual(['sp-1@example.com', 'sp-2@example.com'])
    expect(report).toMatchObject({ emailed: 1, emailFailed: 1 })
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('summary email not sent'),
      expect.objectContaining({ talkId: 'talk-1', speakerId: 'sp-1' }),
      expect.any(Error),
    )

    h.sendEmail.mockClear()
    await deliverFeedbackSummaries({ now: LATER })
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('a second run that loses the claim race sends nothing', async () => {
    // Another run claims talk-1 between this run's read and its commit.
    store().beforeNextCommit(() =>
      store().put({
        ...store().doc('talk-1')!,
        feedbackSummarySentAt: '2026-06-12T07:59:59.000Z',
        _rev: 'rev-other-run',
      }),
    )

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(notifications()).toEqual([])
    expect(sentAt('talk-1')).toBe('2026-06-12T07:59:59.000Z')
    expect(report).toMatchObject({ claimed: 0, emailed: 0 })
  })

  it('two runs at once claim once', async () => {
    await Promise.all([
      deliverFeedbackSummaries({ now: NOW }),
      deliverFeedbackSummaries({ now: NOW }),
    ])
    expect(emailsTo().sort()).toEqual(['sp-1@example.com', 'sp-2@example.com'])
  })

  it('writes the claim to the draft and an active release version, each revision-guarded, in the claim’s transaction', async () => {
    h.releases = [{ name: 'r1', state: 'active' }]
    store().put(talk('drafts.talk-1', 'conf-A'))
    store().put(talk('versions.r1.talk-1', 'conf-A'))

    await deliverFeedbackSummaries({ now: NOW })

    const claim = store().commits.find((c) =>
      c.some((m) => 'patch' in m && m.patch.id === 'talk-1'),
    )!
    expect(
      claim.map((m) => ('patch' in m ? m.patch : null)).filter(Boolean),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'talk-1', ifRevisionID: 'rev-talk-1' }),
        expect.objectContaining({
          id: 'drafts.talk-1',
          ifRevisionID: 'rev-drafts.talk-1',
        }),
        expect.objectContaining({
          id: 'versions.r1.talk-1',
          ifRevisionID: 'rev-versions.r1.talk-1',
        }),
      ]),
    )
    expect(claim).toHaveLength(3)
    for (const id of ['talk-1', 'drafts.talk-1', 'versions.r1.talk-1']) {
      expect(sentAt(id)).toBe(NOW.toISOString())
    }
  })

  it('retries the claim when a draft is edited during it, and still sends once', async () => {
    store().put(talk('drafts.talk-1', 'conf-A'))
    store().beforeNextCommit(() =>
      store().put({ ...talk('drafts.talk-1', 'conf-A'), _rev: 'rev-edited' }),
    )

    await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBe(NOW.toISOString())
    expect(sentAt('drafts.talk-1')).toBe(NOW.toISOString())
    expect(emailsTo()).toHaveLength(2)
  })

  it('tells the speakers of the revision it claimed: speakers changed during the claim are read again', async () => {
    store().put(speaker('sp-new'))
    // An organizer replaces the speakers between this run's reads and its
    // claim's commit.
    store().beforeNextCommit(() =>
      store().put({
        ...store().doc('talk-1')!,
        speakers: [{ ...ref('sp-new'), _key: 'kn' }],
        _rev: 'rev-speakers-changed',
      }),
    )

    await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBe(NOW.toISOString())
    expect(emailsTo()).toEqual(['sp-new@example.com'])
    expect(notifications().map((n) => n._id)).toEqual([
      'notification.feedback-summary.talk-1.sp-new',
    ])
  })

  it('tells the speakers of the revision it claimed: speakers changed before the claim’s read are read again', async () => {
    store().put(speaker('sp-new'))
    // The change lands after the talk was read, before the claim reads it.
    store().beforeEachRead((read) => {
      if (
        read.query.includes('sanity::versionOf') &&
        store().doc('talk-1')!._rev === 'rev-talk-1'
      ) {
        store().put({
          ...store().doc('talk-1')!,
          speakers: [{ ...ref('sp-new'), _key: 'kn' }],
          _rev: 'rev-speakers-changed',
        })
      }
    })

    await deliverFeedbackSummaries({ now: NOW })

    expect(emailsTo()).toEqual(['sp-new@example.com'])
  })

  it('sweeps a draft created between the claim’s read and its commit', async () => {
    store().beforeNextCommit(() => store().put(talk('drafts.talk-1', 'conf-A')))

    await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('drafts.talk-1')).toBe(NOW.toISOString())
  })

  it('leaves a talk unclaimed while a version of it waits in a scheduled release', async () => {
    h.releases = [{ name: 'r1', state: 'scheduled' }]
    store().put(talk('versions.r1.talk-1', 'conf-A'))

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBeUndefined()
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(notifications()).toEqual([])
    expect(report).toMatchObject({ claimed: 0, skipped: 1 })
  })

  it('leaves a talk unclaimed when the releases cannot be listed', async () => {
    h.releasesFail = true

    await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBeUndefined()
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('claims nothing when a read it needs fails, so the next run sends it', async () => {
    store().failReadsThat(
      (r) =>
        r.query.includes('"feedbackResponse"') && !r.query.includes('"talk"'),
    )

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBeUndefined()
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(report).toMatchObject({ claimed: 0, failed: 1 })
  })

  it('does not claim a talk whose answers were all removed after the selection read', async () => {
    // An organizer removes the answers while the run reads the schedule.
    store().beforeEachRead((read) => {
      if (read.query.includes('"schedule"')) {
        for (const d of store().all()) {
          if (d._type === 'feedbackResponse') store().remove(d._id)
        }
      }
    })

    await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBeUndefined()
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('does not tell a speaker erased after the talk was read, just before the claim landed', async () => {
    store().afterNextCommit(() =>
      store().put({
        ...speaker('sp-2'),
        erasedAt: '2026-06-12T08:00:01.000Z',
      }),
    )

    await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBe(NOW.toISOString())
    expect(emailsTo()).toEqual(['sp-1@example.com'])
    expect(notifications().map((n) => n._id)).toEqual([
      'notification.feedback-summary.talk-1.sp-1',
    ])
  })

  it('tells the speaker a duplicate was merged into after the claim, and not the duplicate', async () => {
    store().afterNextCommit(() => merge('sp-2', 'sp-kept'))

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBe(NOW.toISOString())
    expect(emailsTo().sort()).toEqual([
      'sp-1@example.com',
      'sp-kept@example.com',
    ])
    expect(
      notifications()
        .map((n) => n._id)
        .sort(),
    ).toEqual([
      'notification.feedback-summary.talk-1.sp-1',
      'notification.feedback-summary.talk-1.sp-kept',
    ])
    expect(report).toMatchObject({ claimed: 1, emailed: 2 })
  })

  it('reads the merged talk again within the one time limit of the speaker read', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    store().afterNextCommit(() => merge('sp-2', 'sp-kept'))

    await deliverFeedbackSummaries({ now: NOW })

    expect(emailsTo().sort()).toEqual([
      'sp-1@example.com',
      'sp-kept@example.com',
    ])
    // Before the claim; after it; and again for the talk's speakers now.
    const [, after, again] = h.speakerReadOptions as { signal: AbortSignal }[]
    const reread = (h.talkReadOptions.at(-1) ?? {}) as { signal?: unknown }
    // One signal, made to abort after the speaker read's 10 s, for all three.
    const made = timeout.mock.results.findIndex((r) => r.value === after.signal)
    expect(timeout.mock.calls[made]).toEqual([10_000])
    expect(again.signal).toBe(after.signal)
    expect(reread.signal).toBe(after.signal)
  })

  it('follows a second merge that lands between its reads', async () => {
    store().afterNextCommit(() => merge('sp-2', 'sp-mid'))
    h.beforeSpeakerRead = (ids) => {
      if (ids.includes('sp-mid')) {
        h.beforeSpeakerRead = null
        merge('sp-mid', 'sp-kept')
      }
    }

    await deliverFeedbackSummaries({ now: NOW })

    expect(emailsTo().sort()).toEqual([
      'sp-1@example.com',
      'sp-kept@example.com',
    ])
    expect(
      notifications()
        .map((n) => n._id)
        .sort(),
    ).toEqual([
      'notification.feedback-summary.talk-1.sp-1',
      'notification.feedback-summary.talk-1.sp-kept',
    ])
  })

  it('reads the talk once when a gone speaker is still named on it: nobody to follow', async () => {
    store().afterNextCommit(() => store().remove('sp-2'))

    await deliverFeedbackSummaries({ now: NOW })

    expect(emailsTo()).toEqual(['sp-1@example.com'])
    // Before the claim, and once after it.
    expect(h.speakerReadOptions).toHaveLength(2)
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining('kept being merged'),
      expect.anything(),
    )
  })

  it('reads no further when the gone speaker is still named, in another order', async () => {
    store().afterNextCommit(() => {
      store().remove('sp-2')
      const t = store().doc('talk-1')!
      store().put({
        ...t,
        _rev: 'rev-reordered',
        speakers: [...(t.speakers as unknown[])].reverse(),
      })
    })

    await deliverFeedbackSummaries({ now: NOW })

    expect(emailsTo()).toEqual(['sp-1@example.com'])
    expect(h.speakerReadOptions).toHaveLength(2)
  })

  it('tells the speakers still there when the talk itself is gone after the claim', async () => {
    store().afterNextCommit(() => {
      store().remove('sp-2')
      store().remove('talk-1')
    })

    await deliverFeedbackSummaries({ now: NOW })

    expect(emailsTo()).toEqual(['sp-1@example.com'])
  })

  it('tells a merged-in speaker of a talk that had no one to email', async () => {
    store().put(speaker('sp-1', { email: undefined }))
    store().put(talk('talk-1', 'conf-A'))
    store().afterNextCommit(() => merge('sp-1', 'sp-kept'))

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(emailsTo()).toEqual(['sp-kept@example.com'])
    expect(report).toMatchObject({ claimed: 1, emailed: 1 })
  })

  it('reads the talk again only when a claimed speaker is gone', async () => {
    await deliverFeedbackSummaries({ now: NOW })

    // An erased speaker is still there: no second look.
    expect(h.speakerReadOptions).toHaveLength(2)
    const [, after] = h.speakerReadOptions as { signal: AbortSignal }[]
    expect(
      (h.talkReadOptions as ({ signal?: unknown } | undefined)[]).some(
        (o) => o?.signal === after.signal,
      ),
    ).toBe(false)
  })

  it('sends nothing when the speakers cannot be read again after the claim', async () => {
    h.speakerReadsFailAfterClaim = true

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBe(NOW.toISOString())
    // Reported as claimed and logged as such, not as "stays unclaimed".
    expect(report).toMatchObject({ claimed: 1, failed: 0, emailed: 0 })
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('could not be read after the claim'),
      expect.objectContaining({ talkId: 'talk-1' }),
      expect.any(Error),
    )
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(notifications()).toEqual([])
  })

  it('does not claim a talk moved later on the schedule after the selection read', async () => {
    // The organizers move talk-1 to a slot whose window is still open while
    // the run reads its answers.
    store().beforeEachRead((read) => {
      if (read.query.includes('talk._ref == $talkId')) {
        store().put(
          day('day-1', 'conf-A', '2026-06-12', 'official', [
            ['talk-1', '09:00', '09:40'],
          ]),
        )
      }
    })

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBeUndefined()
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(report).toMatchObject({ claimed: 0, skipped: 1 })
  })

  it('does not claim an unscheduled talk whose conference was extended after the selection read', async () => {
    store().put(
      talk('talk-b', 'conf-B', { speakers: [{ ...ref('sp-b'), _key: 'k' }] }),
    )
    store().put(response('talk-b', 'conf-B', 'green'))
    // The organizers move conf-B's end past NOW once the run has selected
    // talk-b as due by the old one.
    h.beforeDocRead = (id) => {
      if (id !== 'talk-b') return
      h.beforeDocRead = null
      store().put({ ...CONF_B, endDate: '2026-06-20' })
    }

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-b')).toBeUndefined()
    expect(emailsTo()).not.toContain('sp-b@example.com')
    expect(report).toMatchObject({ skipped: 1 })
  })

  it('sends through the From and to the domain the conference has when the talk is claimed, not at the selection', async () => {
    // The organizers change conf-A's speaker mail and domain once the run
    // has selected talk-1.
    h.beforeDocRead = (id) => {
      if (id !== 'talk-1') return
      h.beforeDocRead = null
      store().put({
        ...CONF_A,
        cfpEmail: 'cfp@new.example.com',
        domains: ['new.example.com'],
      })
    }

    await deliverFeedbackSummaries({ now: NOW })

    const sends = h.sendEmail.mock.calls.map(
      ([arg]) =>
        arg as {
          sender: { key: string }
          resultsUrl: string
          conference: { cfpEmail: string }
        },
    )
    expect(sends).toHaveLength(2)
    for (const email of sends) {
      expect(email.sender.key).toBe('sender-org-A|Org <cfp@new.example.com>')
      expect(email.resultsUrl).toMatch(/^https:\/\/new\.example\.com\//)
      expect(email.conference.cfpEmail).toBe('cfp@new.example.com')
    }
  })

  it('resolves a conference’s sender once for all its talks while it does not change', async () => {
    seed([
      talk('talk-2', 'conf-A'),
      response('talk-2', 'conf-A', 'green'),
      day('day-3', 'conf-A', '2026-06-10', 'official', [
        ['talk-2', '10:00', '10:40'],
      ]),
    ])

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(report).toMatchObject({ claimed: 2 })
    expect(h.resolveSender).toHaveBeenCalledTimes(1)
  })

  it('resolves the sender again when the conference changes between two of its talks', async () => {
    seed([
      talk('talk-2', 'conf-A'),
      response('talk-2', 'conf-A', 'green'),
      day('day-3', 'conf-A', '2026-06-10', 'official', [
        ['talk-2', '10:00', '10:40'],
      ]),
    ])
    // Once the first talk has gone out, the organizers change conf-A's
    // speaker mail: the next talk read sees it.
    const talksRead = new Set<string>()
    h.beforeDocRead = (id) => {
      if (id !== 'talk-1' && id !== 'talk-2') return
      talksRead.add(id)
      if (talksRead.size === 2) {
        h.beforeDocRead = null
        store().put({ ...CONF_A, cfpEmail: 'cfp@new.example.com' })
      }
    }

    await deliverFeedbackSummaries({ now: NOW })

    const keyOf = new Map(
      h.sendEmail.mock.calls.map(([arg]) => {
        const a = arg as { talkId: string; sender: { key: string } }
        return [a.talkId, a.sender.key]
      }),
    )
    const [first, second] = [...talksRead]
    expect(keyOf.get(first)).toBe('sender-org-A|Org <cfp@a.example.com>')
    expect(keyOf.get(second)).toBe('sender-org-A|Org <cfp@new.example.com>')
  })

  it('does not claim a talk withdrawn after the selection read', async () => {
    store().readsLagFor('talk-1', talk('talk-1', 'conf-A'))
    store().put({ ...talk('talk-1', 'conf-A'), status: 'withdrawn' })

    await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBeUndefined()
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  describe('a conference whose selection reads fail', () => {
    /** conf-B's unscheduled talk, due since its conference is over. */
    const otherTenant = () => {
      store().put(
        talk('talk-b', 'conf-B', { speakers: [{ ...ref('sp-b'), _key: 'k' }] }),
      )
      store().put(response('talk-b', 'conf-B', 'green'))
    }

    it('delivers a conference’s talks before it reads the next conference', async () => {
      otherTenant()
      const conferencesReadBy: string[][] = []
      h.sendEmail.mockImplementation(async () => {
        conferencesReadBy.push([
          ...new Set(
            store().docReads.filter((id) => id === 'conf-A' || id === 'conf-B'),
          ),
        ])
      })

      await deliverFeedbackSummaries({ now: NOW })

      // By the first email only its own conference has been read: a slow
      // conference later in the run cannot hold it up.
      expect(conferencesReadBy[0]).toHaveLength(1)
      expect(conferencesReadBy.at(-1)).toHaveLength(2)
    })

    it('holds back only its own talks when the conference cannot be read', async () => {
      otherTenant()
      h.failDocReadsOf = ['conf-A']

      const report = await deliverFeedbackSummaries({ now: NOW })

      expect(sentAt('talk-1')).toBeUndefined()
      expect(sentAt('talk-b')).toBe(NOW.toISOString())
      expect(emailsTo()).toEqual(['sp-b@example.com'])
      // talk-1 and talk-open, both of conf-A, not tried this run.
      expect(report).toMatchObject({ claimed: 1, failed: 2 })
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('skipped a conference whose reads failed'),
        { conferenceId: 'conf-A', talks: 2 },
        expect.any(Error),
      )
    })

    it('holds back only its own talks when the conference read hangs', async () => {
      otherTenant()
      h.hangDocReadsOf = ['conf-A']
      // The real limit, shortened: the read is given up on, not waited out.
      const timeout = AbortSignal.timeout.bind(AbortSignal)
      vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(20))

      const report = await deliverFeedbackSummaries({ now: NOW })

      expect(sentAt('talk-b')).toBe(NOW.toISOString())
      expect(report).toMatchObject({ claimed: 1, failed: 2 })
    })

    it('ends a read at the run’s deadline, not after its own limit, and counts what it held back as not reached', async () => {
      otherTenant()
      h.hangDocReadsOf = ['conf-A']
      const start = Date.now()

      const report = await deliverFeedbackSummaries({
        now: NOW,
        deadline: new Date(start + 150),
      })

      // Far inside the read's own 10 s.
      expect(Date.now() - start).toBeLessThan(2_000)
      // conf-A's two candidates, and talk-b, past the deadline.
      expect(report).toMatchObject({ claimed: 0, failed: 0, notReached: 3 })
    })

    describe('when the deadline timer fires before the clock reaches the deadline', () => {
      // The run's timer is monotonic and `Date.now()` is not: the timer can
      // fire a millisecond before the wall clock says the deadline has come.
      // Hand the run the timer, fire it while the clock is far short of the
      // deadline, and the read it cut off must still count as not reached.
      const earlyDeadline = () => {
        const fired = new AbortController()
        vi.spyOn(AbortSignal, 'timeout').mockImplementationOnce(
          () => fired.signal,
        )
        return () =>
          fired.abort(new DOMException('deadline (test)', 'TimeoutError'))
      }

      it('counts a conference cut off as not reached, not failed', async () => {
        h.hangDocReadsOf = ['conf-A']
        const fire = earlyDeadline()
        setTimeout(fire, 20)

        const report = await deliverFeedbackSummaries({
          now: NOW,
          deadline: new Date(Date.now() + 60_000),
        })

        expect(report).toMatchObject({ failed: 0, notReached: 2 })
      })

      it('counts a talk cut off as not reached, not failed', async () => {
        h.hangDocReadsOf = ['talk-1']
        const fire = earlyDeadline()
        setTimeout(fire, 20)

        const report = await deliverFeedbackSummaries({
          now: NOW,
          deadline: new Date(Date.now() + 60_000),
        })

        expect(sentAt('talk-1')).toBeUndefined()
        expect(report).toMatchObject({ due: 1, failed: 0, notReached: 1 })
      })

      it('counts a talk whose own read the deadline cut off as not reached, not failed', async () => {
        h.hangDocReadsOf = ['talk-1']
        const fire = earlyDeadline()
        // Fired once the talk's own read is waiting, whatever the load: not
        // during the selection, and not after a wall-clock guess.
        h.beforeDocRead = (id) => {
          if (id === 'talk-1') setTimeout(fire, 0)
        }

        const report = await deliverFeedbackSummaries({
          now: NOW,
          deadline: new Date(Date.now() + 60_000),
        })

        expect(h.docReadsTried).toContain('talk-1')
        expect(sentAt('talk-1')).toBeUndefined()
        expect(report).toMatchObject({ due: 1, failed: 0, notReached: 1 })
      })
    })

    it('gives up on a talk whose own read hangs, and goes on with the next', async () => {
      otherTenant()
      h.hangDocReadsOf = ['talk-1']
      const timeout = AbortSignal.timeout.bind(AbortSignal)
      vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(20))

      const report = await deliverFeedbackSummaries({ now: NOW })

      expect(sentAt('talk-1')).toBeUndefined()
      expect(sentAt('talk-b')).toBe(NOW.toISOString())
      expect(report).toMatchObject({ claimed: 1, failed: 1 })
    })

    it('bounds every uncached read of the run with a signal', async () => {
      otherTenant()

      await deliverFeedbackSummaries({ now: NOW })

      // The selection, each conference's schedule, each talk's answers
      // and slots.
      expect(h.uncachedReadOptions.length).toBeGreaterThanOrEqual(5)
      for (const options of h.uncachedReadOptions) {
        expect(options).toMatchObject({ signal: expect.any(AbortSignal) })
      }
    })

    it('holds back only its own talks when its schedule cannot be read', async () => {
      otherTenant()
      store().failReadsThat(
        (r) =>
          r.query.includes('_type == "schedule"') &&
          r.params.conferenceId === 'conf-A',
      )

      const report = await deliverFeedbackSummaries({ now: NOW })

      expect(sentAt('talk-1')).toBeUndefined()
      expect(sentAt('talk-b')).toBe(NOW.toISOString())
      expect(report).toMatchObject({ claimed: 1, failed: 2 })
    })
  })

  it('a failed run for one talk does not stop the next', async () => {
    seed([
      talk('talk-b', 'conf-B', { speakers: [{ ...ref('sp-b'), _key: 'k' }] }),
      response('talk-b', 'conf-B', 'red'),
      day('day-B1', 'conf-B', '2026-06-10', 'official', [
        ['talk-b', '10:00', '10:40'],
      ]),
    ])
    store().failPatchesOf('talk-1')

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-b')).toBe(NOW.toISOString())
    expect(emailsTo()).toEqual(['sp-b@example.com'])
    const [email] = h.sendEmail.mock.calls[0] as [Record<string, unknown>]
    expect(email.resultsUrl).toBe(
      'https://b.example.com/cfp/proposal/talk-b#session-feedback',
    )
    expect(report).toMatchObject({ claimed: 1, failed: 1 })
  })

  it('starts no talk past the deadline, and reads nothing for it', async () => {
    const report = await deliverFeedbackSummaries({
      now: NOW,
      deadline: new Date(0),
    })
    expect(sentAt('talk-1')).toBeUndefined()
    // Not even its conference is read: both of conf-A's candidates wait.
    expect(report).toMatchObject({ claimed: 0, due: 0, notReached: 2 })
    expect(h.resolveSender).not.toHaveBeenCalled()
    expect(store().docReads).not.toContain('talk-1')
    expect(store().docReads).not.toContain('conf-A')
  })
})

describe('deliverFeedbackSummaries: a claim whose reply is lost', () => {
  it('sends when the claim landed but its reply did not arrive', async () => {
    // Sanity applied the claim; the socket reset before the answer came back.
    store().afterNextCommit(() => {
      throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    })

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBe(NOW.toISOString())
    expect(emailsTo().sort()).toEqual(['sp-1@example.com', 'sp-2@example.com'])
    expect(notifications()).toHaveLength(2)
    expect(report).toMatchObject({ claimed: 1, failed: 0 })
  })

  it('knows its own claim by the transaction id, even after a later edit changed the stored time', async () => {
    store().afterNextCommit(() => {
      // Only the transaction id is left to recognize the claim by.
      store().put({
        ...store().doc('talk-1')!,
        feedbackSummarySentAt: '2026-06-12T07:00:00.000Z',
      })
      throw Object.assign(new Error('502 Bad Gateway'), { statusCode: 502 })
    })

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(emailsTo()).toHaveLength(2)
    expect(report).toMatchObject({ claimed: 1, failed: 0 })
  })

  it('does not take another run’s claim, written at the same moment, for its own', async () => {
    // Another run started in the same millisecond claims talk-1 first; this
    // run's commit then fails without landing.
    store().beforeNextCommit(() => {
      store().put({
        ...store().doc('talk-1')!,
        feedbackSummarySentAt: NOW.toISOString(),
        _rev: 'rev-other-run',
      })
      throw Object.assign(new Error('502 Bad Gateway'), { statusCode: 502 })
    })

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(notifications()).toEqual([])
    expect(report).toMatchObject({ claimed: 0, failed: 1 })
  })

  it('leaves the talk unclaimed when the failed commit did not land', async () => {
    store().beforeNextCommit(() => {
      throw Object.assign(new Error('502 Bad Gateway'), { statusCode: 502 })
    })

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBeUndefined()
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(report).toMatchObject({ claimed: 0, failed: 1 })
  })

  it('logs each claim as it lands, so a run killed mid-send leaves a trace', async () => {
    await deliverFeedbackSummaries({ now: NOW })
    expect(console.log).toHaveBeenCalledWith(
      '[feedback] claimed talk-1 for its summary',
    )
  })

  it('bounds the speaker read after the claim with a timeout signal', async () => {
    await deliverFeedbackSummaries({ now: NOW })
    // Before the claim (to budget the emails) and after it (erasure).
    expect(h.speakerReadOptions).toEqual([
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ])
  })
})

const bothSpeakers = {
  speakers: [
    { _type: 'reference', _ref: 'sp-1', _key: 'k1' },
    { _type: 'reference', _ref: 'sp-2', _key: 'k2' },
  ],
}

describe('deliverFeedbackSummaries: a sender that cannot send', () => {
  /** Two more due talks of conf-A (same sender), one of conf-B (another). */
  const moreDue = () => [
    talk('talk-2', 'conf-A'),
    talk('talk-3', 'conf-A'),
    talk('talk-b', 'conf-B', { speakers: [{ ...ref('sp-b'), _key: 'k' }] }),
    response('talk-2', 'conf-A', 'green'),
    response('talk-3', 'conf-A', 'green'),
    response('talk-b', 'conf-B', 'green'),
    day('day-3', 'conf-A', '2026-06-10', 'official', [
      ['talk-2', '10:00', '10:40'],
      ['talk-3', '11:00', '11:40'],
    ]),
    day('day-B1', 'conf-B', '2026-06-10', 'official', [
      ['talk-b', '10:00', '10:40'],
    ]),
  ]
  const refusal = (name: string, status: number, message = name) =>
    Object.assign(new Error(`Resend refused the email: ${message}`), {
      resendErrorName: name,
      status,
    })
  /** A bad address, as Resend words it. */
  const badAddress = () =>
    refusal('validation_error', 422, 'Invalid `to` field.')

  it('gives up on a sender whose resolution hangs, and goes on with the other tenants', async () => {
    seed(moreDue())
    h.resolveSender.mockImplementation(
      async (conference: {
        _id: string
        organization?: { _ref?: string }
        cfpEmail?: string
      }) => {
        if (conference._id === 'conf-A') return new Promise(() => {})
        const account = `sender-${conference.organization?._ref}`
        return { account, key: `${account}|Org <${conference.cfpEmail}>` }
      },
    )
    // The real limit, shortened: the resolution is given up on, not waited out.
    const timeout = AbortSignal.timeout.bind(AbortSignal)
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(20))
    const start = Date.now()

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(Date.now() - start).toBeLessThan(2_000)
    expect(sentAt('talk-b')).toBe(NOW.toISOString())
    expect(['talk-1', 'talk-2', 'talk-3'].some((id) => sentAt(id))).toBe(false)
    expect(report).toMatchObject({ claimed: 1, failed: 3 })
  })

  it('leaves the rest of a conference whose talks fail one after another for the next run', async () => {
    seed(moreDue())
    h.failDocReadsOf = ['talk-1', 'talk-2', 'talk-3']

    const report = await deliverFeedbackSummaries({ now: NOW })

    // Two of conf-A's three talks tried; the third waits, unclaimed.
    const tried = new Set(
      h.docReadsTried.filter((id) =>
        ['talk-1', 'talk-2', 'talk-3'].includes(id),
      ),
    )
    expect(tried.size).toBe(2)
    expect(sentAt('talk-b')).toBe(NOW.toISOString())
    expect(report).toMatchObject({ claimed: 1, failed: 3 })
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('whose talks keep failing'),
      { conferenceId: 'conf-A' },
    )
  })

  it('counts failures in a row only: a talk sent in between starts the count again', async () => {
    seed([
      ...moreDue(),
      talk('talk-4', 'conf-A'),
      response('talk-4', 'conf-A', 'green'),
      day('day-4', 'conf-A', '2026-06-10', 'official', [
        ['talk-4', '12:00', '12:40'],
      ]),
    ])
    h.failDocReadsOf = ['talk-1', 'talk-3']

    await deliverFeedbackSummaries({ now: NOW })

    // The store keeps conf-A's talks in this order: fail, sent, fail, sent.
    expect(
      [...new Set(h.docReadsTried)].filter((id) => /^talk-\d$/.test(id)),
    ).toEqual(['talk-1', 'talk-2', 'talk-3', 'talk-4'])
    expect(sentAt('talk-4')).toBe(NOW.toISOString())
  })

  it('takes the conferences in a new order each run', async () => {
    const firstConference = () =>
      store().docReads.find((id) => id === 'conf-A' || id === 'conf-B')
    const firsts: (string | undefined)[] = []
    for (const r of [0, 0.99]) {
      seed(moreDue())
      h.sendEmail.mockClear()
      vi.spyOn(Math, 'random').mockReturnValue(r)
      await deliverFeedbackSummaries({ now: NOW })
      firsts.push(firstConference())
      vi.mocked(Math.random).mockRestore()
    }
    expect(new Set(firsts).size).toBe(2)
  })

  it('claims nothing when the tenant’s sender cannot be resolved', async () => {
    h.resolveSender.mockRejectedValue(new Error('tenant env slug unavailable'))

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBeUndefined()
    expect(notifications()).toEqual([])
    expect(report).toMatchObject({ claimed: 0, failed: 1 })
  })

  it('stops claiming a sender’s talks once every email of one talk failed for a reason that is not the address', async () => {
    seed(moreDue())
    h.sendEmail.mockImplementation(async ({ to }: { to: string }) => {
      if (to !== 'sp-b@example.com') throw refusal('invalid_api_key', 401)
    })

    const report = await deliverFeedbackSummaries({ now: NOW })

    const claimed = ['talk-1', 'talk-2', 'talk-3'].filter((id) => sentAt(id))
    expect(claimed).toHaveLength(1)
    // Another tenant's sender is not affected.
    expect(sentAt('talk-b')).toBe(NOW.toISOString())
    expect(report).toMatchObject({ claimed: 2, senderDown: 2 })
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('stops sending through a Resend account'),
      { orgId: 'org-A', conferenceId: 'conf-A', talkId: expect.any(String) },
    )
    // The sender's From address is not logged.
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      'cfp@a.example.com',
    )

    // The next run, with the sender working again, sends the two it left.
    h.sendEmail.mockReset()
    h.sendEmail.mockResolvedValue(undefined)
    await deliverFeedbackSummaries({ now: LATER })
    expect(['talk-1', 'talk-2', 'talk-3'].every((id) => sentAt(id))).toBe(true)
    expect(h.sendEmail).toHaveBeenCalled()
  })

  it('names the organization the conference has when the talk is claimed in the breaker’s log', async () => {
    // conf-A moves to org-C once the run has selected talk-1.
    h.beforeDocRead = (id) => {
      if (id !== 'talk-1') return
      h.beforeDocRead = null
      store().put({ ...CONF_A, organization: ref('org-C') })
    }
    h.sendEmail.mockRejectedValue(
      refusal('validation_error', 401, 'API key is invalid'),
    )

    await deliverFeedbackSummaries({ now: NOW })

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('stops sending through a Resend account'),
      { orgId: 'org-C', conferenceId: 'conf-A', talkId: 'talk-1' },
    )
  })

  it('stops on a dead sender even when a co-speaker’s address was refused too', async () => {
    // Every conf-A talk: sp-1's address is refused, sp-2's email fails for
    // the sender's reason. No email of the talk went out.
    seed([
      ...moreDue().filter((d) => d._id !== 'talk-2' && d._id !== 'talk-3'),
      talk('talk-2', 'conf-A', bothSpeakers),
      talk('talk-3', 'conf-A', bothSpeakers),
    ])
    h.sendEmail.mockImplementation(async ({ to }: { to: string }) => {
      if (to === 'sp-1@example.com') throw badAddress()
      if (to === 'sp-2@example.com') throw refusal('invalid_api_key', 401)
    })

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(report).toMatchObject({ claimed: 2, senderDown: 2 })
  })

  it('counts an email whose outcome Resend still has in progress as unknown, and stops that sender: a stalled Resend', async () => {
    seed([
      ...moreDue().filter((d) => d._id !== 'talk-2' && d._id !== 'talk-3'),
      talk('talk-2', 'conf-A', bothSpeakers),
      talk('talk-3', 'conf-A', bothSpeakers),
    ])
    h.sendEmail.mockRejectedValue(
      refusal('concurrent_idempotent_requests', 409),
    )

    const report = await deliverFeedbackSummaries({ now: NOW })

    // The first conf-A talk claimed trips it; the other two wait a day.
    expect(report).toMatchObject({
      claimed: 2,
      senderDown: 2,
      emailed: 0,
      emailFailed: 0,
      emailUnknown: 3,
    })
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('outcome unknown'),
      expect.objectContaining({ speakerId: expect.any(String) }),
      expect.any(Error),
    )
  })

  it('keeps going when the only failures are bad addresses', async () => {
    seed(moreDue())
    h.sendEmail.mockImplementation(async ({ to }: { to: string }) => {
      if (to !== 'sp-b@example.com') throw badAddress()
    })

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(
      ['talk-1', 'talk-2', 'talk-3', 'talk-b'].every((id) => sentAt(id)),
    ).toBe(true)
    expect(report).toMatchObject({ claimed: 4, senderDown: 0 })
  })

  describe('two conferences on one Resend account, each with its own From', () => {
    const CONF_A2 = {
      ...CONF_A,
      _id: 'conf-A2',
      title: 'Conf A2',
      cfpEmail: 'cfp@a2.example.com',
      domains: ['a2.example.com'],
    }
    const withA2 = () => [
      ...moreDue(),
      CONF_A2,
      talk('talk-a2', 'conf-A2', bothSpeakers),
      response('talk-a2', 'conf-A2', 'green'),
      day('day-A2', 'conf-A2', '2026-06-10', 'official', [
        ['talk-a2', '10:00', '10:40'],
      ]),
    ]
    const orgA = ['talk-1', 'talk-2', 'talk-3', 'talk-a2']

    it('holds every From of the account once the account fails: a revoked key', async () => {
      seed(withA2())
      h.sendEmail.mockImplementation(async ({ to }: { to: string }) => {
        if (to !== 'sp-b@example.com')
          throw refusal('validation_error', 401, 'API key is invalid')
      })

      const report = await deliverFeedbackSummaries({ now: NOW })

      // One org-A talk is claimed and trips it; the rest, of both its
      // conferences, wait for the next run.
      expect(orgA.filter((id) => sentAt(id))).toHaveLength(1)
      expect(sentAt('talk-b')).toBe(NOW.toISOString())
      expect(report).toMatchObject({ claimed: 2, senderDown: 3 })
    })

    it('holds only that From when its domain is not verified', async () => {
      seed(withA2())
      h.sendEmail.mockImplementation(
        async ({ sender }: { sender: { key: string } }) => {
          if (sender.key.includes('cfp@a.example.com'))
            throw refusal(
              'validation_error',
              403,
              'The `a.example.com` domain is not verified. Please, add and verify your domain.',
            )
        },
      )

      const report = await deliverFeedbackSummaries({ now: NOW })

      // conf-A: one talk trips its From, two wait. conf-A2, the same
      // account with another From, still sends.
      expect(
        ['talk-1', 'talk-2', 'talk-3'].filter((id) => sentAt(id)),
      ).toHaveLength(1)
      expect(sentAt('talk-a2')).toBe(NOW.toISOString())
      // talk-a2's two emails and talk-b's one went out.
      expect(report).toMatchObject({ claimed: 3, senderDown: 2, emailed: 3 })
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('stops sending through a From address'),
        expect.objectContaining({ conferenceId: 'conf-A' }),
      )
    })

    it('holds only that From on the testing-only restriction of a resend.dev From', async () => {
      seed(withA2())
      h.sendEmail.mockImplementation(
        async ({ sender }: { sender: { key: string } }) => {
          if (sender.key.includes('cfp@a.example.com'))
            throw refusal(
              'validation_error',
              403,
              'You can only send testing emails to your own email address (you@example.com).',
            )
        },
      )

      const report = await deliverFeedbackSummaries({ now: NOW })

      expect(sentAt('talk-a2')).toBe(NOW.toISOString())
      expect(report).toMatchObject({ claimed: 3, senderDown: 2, emailed: 3 })
    })

    it('does not take a malformed From for bad addresses', async () => {
      seed(withA2())
      h.sendEmail.mockImplementation(
        async ({ sender }: { sender: { key: string } }) => {
          if (sender.key.includes('cfp@a.example.com'))
            throw refusal(
              'validation_error',
              422,
              'Invalid `from` field. The email address needs to follow the `email@example.com` format.',
            )
        },
      )

      const report = await deliverFeedbackSummaries({ now: NOW })

      expect(
        ['talk-1', 'talk-2', 'talk-3'].filter((id) => sentAt(id)),
      ).toHaveLength(1)
      expect(report).toMatchObject({ senderDown: 2 })
    })
  })

  it('keeps going when some email of the talk went out', async () => {
    // Every conf-A talk has a speaker whose email fails and one whose
    // email goes out, whatever order the run takes them in.
    const both = {
      speakers: [
        { ...ref('sp-1'), _key: 'k1' },
        { ...ref('sp-2'), _key: 'k2' },
      ],
    }
    seed([
      ...moreDue().filter((d) => d._id !== 'talk-2' && d._id !== 'talk-3'),
      talk('talk-2', 'conf-A', both),
      talk('talk-3', 'conf-A', both),
    ])
    h.sendEmail.mockImplementation(async ({ to }: { to: string }) => {
      if (to === 'sp-1@example.com') throw refusal('internal_server_error', 500)
    })

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(report).toMatchObject({ claimed: 4, senderDown: 0 })
  })
})

describe('deliverFeedbackSummaries: the run’s time', () => {
  /** `n` speakers of talk-1, `erased` of them erased. */
  const manySpeakers = (n: number, erased: number) => {
    const speakers = Array.from({ length: n }, (_, i) =>
      speaker(
        `sp-m${i}`,
        i < erased ? { erasedAt: '2026-06-01T00:00:00Z' } : {},
      ),
    )
    return {
      speakers,
      talk: talk('talk-1', 'conf-A', {
        speakers: speakers.map((sp) => ({ ...ref(sp._id), _key: sp._id })),
      }),
    }
  }

  it('does not claim a talk whose emails could not all be sent before the deadline, and logs it', async () => {
    const report = await deliverFeedbackSummaries({
      now: NOW,
      deadline: new Date(Date.now() + 40_000),
    })

    expect(sentAt('talk-1')).toBeUndefined()
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(report).toMatchObject({ claimed: 0, notReached: 1 })
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('does not fit'),
      expect.objectContaining({ talkId: 'talk-1' }),
    )
  })

  it('budgets one email for a talk with no one to email: a merge after the claim may bring one', async () => {
    store().put(speaker('sp-1', { email: undefined }))
    store().put(talk('talk-1', 'conf-A'))

    const report = await deliverFeedbackSummaries({
      now: NOW,
      // The claim's steps fit (52 s), one email's worst case after them not.
      deadline: new Date(Date.now() + 60_000),
    })

    expect(sentAt('talk-1')).toBeUndefined()
    expect(report).toMatchObject({ claimed: 0, notReached: 1 })
  })

  it('starts no email whose worst case would end past the deadline, and logs it', async () => {
    store().put(talk('talk-1', 'conf-A'))
    const start = Date.now()
    store().afterNextCommit(() => {
      // The claim's bounded steps took most of their time.
      vi.spyOn(Date, 'now').mockReturnValue(start + 60_000)
    })

    const report = await deliverFeedbackSummaries({
      now: NOW,
      // One recipient fits at the claim (84 s), with 25 s left after it.
      deadline: new Date(start + 85_000),
    })

    expect(sentAt('talk-1')).toBe(NOW.toISOString())
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(report).toMatchObject({
      claimed: 1,
      emailed: 0,
      emailFailed: 1,
    })
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('no time left before the deadline'),
      { talkId: 'talk-1', speakerId: 'sp-1' },
    )
    // Not the sender's failure: the breaker does not trip.
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining('stops sending through a sender'),
      expect.anything(),
    )
  })

  it('sends the recipients it budgeted first, and pauses for none that no longer fits', async () => {
    // sp-2 has no address when the talk is read, so one email is budgeted:
    // sp-1's. After the claim sp-2 is merged into sp-kept, who has one, and
    // is listed first.
    store().put(speaker('sp-2', { email: undefined }))
    store().put(
      talk('talk-1', 'conf-A', {
        speakers: [
          { ...ref('sp-2'), _key: 'k2' },
          { ...ref('sp-1'), _key: 'k1' },
        ],
      }),
    )
    const start = Date.now()
    store().afterNextCommit(() => {
      merge('sp-2', 'sp-kept')
      // Time for one email's worst case left, not for a pause and another.
      vi.spyOn(Date, 'now').mockReturnValue(start + 53_200)
    })

    const report = await deliverFeedbackSummaries({
      now: NOW,
      deadline: new Date(start + 85_000),
    })

    expect(emailsTo()).toEqual(['sp-1@example.com'])
    expect(report).toMatchObject({ emailed: 1, emailFailed: 1 })
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('no time left before the deadline'),
      { talkId: 'talk-1', speakerId: 'sp-kept' },
    )
    expect(h.delay).not.toHaveBeenCalledWith(EMAIL_CONFIG.RATE_LIMIT_DELAY)
  })

  it('claims a talk whose emails fit', async () => {
    const report = await deliverFeedbackSummaries({
      now: NOW,
      deadline: new Date(Date.now() + 10 * 60_000),
    })

    expect(sentAt('talk-1')).toBe(NOW.toISOString())
    expect(report).toMatchObject({ claimed: 1, notReached: 0 })
  })

  it('budgets only the speakers who will get an email', async () => {
    // 20 listed, 18 erased: 2 emails to fit, not 20.
    const { speakers, talk: big } = manySpeakers(20, 18)
    for (const sp of speakers) store().put(sp)
    store().put(big)

    await deliverFeedbackSummaries({
      now: NOW,
      deadline: new Date(Date.now() + 88_000),
    })

    expect(sentAt('talk-1')).toBe(NOW.toISOString())
    expect(emailsTo()).toHaveLength(2)
  })

  it('fits a talk of many speakers in a fresh run: its emails go out side by side', async () => {
    const { speakers, talk: big } = manySpeakers(30, 0)
    for (const sp of speakers) store().put(sp)
    store().put(big)

    const report = await deliverFeedbackSummaries({
      now: NOW,
      deadline: new Date(Date.now() + 290_000),
    })

    expect(report).toMatchObject({ claimed: 1, emailed: 30 })
  })

  it('sends a talk’s emails side by side, starting them a pause apart', async () => {
    let inFlight = 0
    let most = 0
    h.sendEmail.mockImplementation(async () => {
      inFlight++
      most = Math.max(most, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 20))
      inFlight--
    })

    await deliverFeedbackSummaries({ now: NOW })

    expect(most).toBe(2)
    // Every start after the run's first waits the rate limit's pause.
    expect(h.delay.mock.calls).toEqual([[500]])
  })

  it('sweeps the talk’s versions before its emails', async () => {
    store().put(talk('drafts.talk-1', 'conf-A'))
    let readsAtFirstSend = -1
    h.sendEmail.mockImplementation(async () => {
      if (readsAtFirstSend < 0) readsAtFirstSend = store().docReads.length
    })

    await deliverFeedbackSummaries({ now: NOW })

    // The sweep's by-id read of the draft lands before the first email.
    const sweepRead = store().docReads.lastIndexOf('drafts.talk-1')
    expect(sweepRead).toBeLessThan(readsAtFirstSend)
    expect(
      store().docReads.filter((id) => id === 'drafts.talk-1').length,
    ).toBeGreaterThanOrEqual(2)
    expect(sentAt('drafts.talk-1')).toBe(NOW.toISOString())
  })

  it('does not hold the emails on a sweep that hangs', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      // The first version lookup is the claim's; the second, the sweep's.
      let lookups = 0
      store().beforeEachRead((read) => {
        if (read.query.includes('sanity::versionOf') && ++lookups === 2) {
          return new Promise(() => {})
        }
      })
      const run = deliverFeedbackSummaries({ now: NOW })
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await run).toMatchObject({ claimed: 1, emailed: 2 })
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('sweep'),
        expect.objectContaining({ talkId: 'talk-1' }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('makes the claim’s requests through a client with a timeout inside the reserve', async () => {
    await deliverFeedbackSummaries({ now: NOW })
    expect(h.clientConfigs).toContainEqual(
      expect.objectContaining({
        apiVersion: '2025-02-19',
        timeout: expect.any(Number),
      }),
    )
    const timeouts = h.clientConfigs
      .map((c) => c.timeout)
      .filter((t): t is number => typeof t === 'number')
    expect(Math.max(...timeouts)).toBeLessThanOrEqual(5_000)
  })

  it('sends when the claim’s commit timed out here but landed', async () => {
    store().afterNextCommit(() => {
      throw Object.assign(new Error('Request timed out'), {
        code: 'ETIMEDOUT',
      })
    })

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBe(NOW.toISOString())
    expect(emailsTo()).toHaveLength(2)
    expect(report).toMatchObject({ claimed: 1, failed: 0 })
  })

  it('sends when the claim’s commit timed out and landed only after the first read-back', async () => {
    store().beforeNextCommit(() => {
      throw Object.assign(new Error('Request timed out'), {
        code: 'ETIMEDOUT',
      })
    })
    // Sanity applies the commit while the run waits to look again.
    h.delay.mockImplementation(async (ms: number) => {
      if (ms === 2_000 && !sentAt('talk-1')) {
        store().put({
          ...store().doc('talk-1')!,
          feedbackSummarySentAt: NOW.toISOString(),
          _rev: h.lastTransactionId!,
        })
      }
    })

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(emailsTo()).toHaveLength(2)
    expect(report).toMatchObject({ claimed: 1, failed: 0 })
  })

  it('leaves the talk unclaimed when the claim’s commit timed out and did not land', async () => {
    store().beforeNextCommit(() => {
      throw Object.assign(new Error('Request timed out'), {
        code: 'ETIMEDOUT',
      })
    })

    const report = await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBeUndefined()
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(report).toMatchObject({ claimed: 0, failed: 1 })
    // It may still land; the log does not say otherwise.
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('may still land'),
      expect.objectContaining({ talkId: 'talk-1' }),
      expect.any(Error),
    )
  })

  it('does not commit a claim when the version reads used up the time it needed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const start = Date.now()
      // Fits when the run reads the talk; the version lookup then takes 30 s.
      store().beforeEachRead((read) => {
        if (read.query.includes('sanity::versionOf')) {
          vi.setSystemTime(start + 30_000)
        }
      })

      const report = await deliverFeedbackSummaries({
        now: NOW,
        deadline: new Date(start + 100_000),
      })

      expect(sentAt('talk-1')).toBeUndefined()
      expect(h.sendEmail).not.toHaveBeenCalled()
      expect(report).toMatchObject({ claimed: 0, notReached: 1 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not hold the emails, or the run, on a bell write that hangs', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      // The claim commits first; the next commit is the bell's, which hangs.
      store().afterNextCommit(() => {
        store().beforeNextCommit(() => new Promise(() => {}))
      })
      const run = deliverFeedbackSummaries({ now: NOW })
      for (let i = 0; i < 200 && h.sendEmail.mock.calls.length < 2; i++) {
        await new Promise((resolve) => setImmediate(resolve))
      }
      expect(emailsTo().sort()).toEqual([
        'sp-1@example.com',
        'sp-2@example.com',
      ])
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await run).toMatchObject({ claimed: 1, emailed: 2 })
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('bell'),
        expect.objectContaining({ talkId: 'talk-1' }),
      )
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('deliverFeedbackSummaries: a title with nothing visible', () => {
  it('names the session generically', async () => {
    store().put({
      ...store().doc('talk-1')!,
      title: '\u200D\u00AD\u2060',
    })

    await deliverFeedbackSummaries({ now: NOW })

    expect(
      store().doc('notification.feedback-summary.talk-1.sp-1')?.title,
    ).toBe('Your Session Feedback for “your session”')
  })
})
