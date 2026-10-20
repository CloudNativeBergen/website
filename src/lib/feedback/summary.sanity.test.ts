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
  sendEmail: vi.fn(),
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
  return {
    ...clients,
    clientWrite: {
      ...clients.clientWrite,
      withConfig: (c: { apiVersion: string }) =>
        withReleases(clients.clientWrite.withConfig(c)),
    },
  }
})

vi.mock('@/lib/email/feedback-summary', () => ({
  sendFeedbackSummaryEmail: (...args: unknown[]) => h.sendEmail(...args),
}))

vi.mock('@/lib/email/config', async (original) => ({
  ...(await original<typeof import('@/lib/email/config')>()),
  delay: async () => {},
}))

import { runGroq } from '../../../__tests__/helpers/sanityStore'
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

beforeEach(() => {
  h.releases = []
  h.releasesFail = false
  h.sendEmail.mockReset()
  h.sendEmail.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  seed()
})

afterEach(() => {
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

  it('does not claim a talk withdrawn after the selection read', async () => {
    store().readsLagFor('talk-1', talk('talk-1', 'conf-A'))
    store().put({ ...talk('talk-1', 'conf-A'), status: 'withdrawn' })

    await deliverFeedbackSummaries({ now: NOW })

    expect(sentAt('talk-1')).toBeUndefined()
    expect(h.sendEmail).not.toHaveBeenCalled()
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

  it('starts no talk past the deadline', async () => {
    const report = await deliverFeedbackSummaries({
      now: NOW,
      deadline: new Date(0),
    })
    expect(sentAt('talk-1')).toBeUndefined()
    expect(report).toMatchObject({ claimed: 0, notReached: 1 })
  })
})
