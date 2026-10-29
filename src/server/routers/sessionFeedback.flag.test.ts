/**
 * @vitest-environment node
 *
 * `sessionFeedback.flag` (speaker feedback spec §9.1, §9.3, §10.3, §11.2)
 * through the tRPC caller, on the versioned in-memory store: GROQ is
 * EXECUTED with groq-js, the doc endpoint reads the stored document, and the
 * flag's write is built by the real `@sanity/client` and applied with
 * `@sanity/mutator`, with `ifRevisionID` checked. The organizers'
 * notifications are written to the same store by the real
 * `createNotifications`; only web push (the network) is replaced.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  push: vi.fn(async (items: unknown) => void items),
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})
vi.mock('@/lib/push/send', () => ({
  sendPushForNotifications: (items: unknown) => h.push(items),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: {
      _id: 'conf-A',
      title: 'CND 2026',
      organization: { _ref: 'org-A' },
      endDate: '2026-06-11',
      domains: ['2026.example.no'],
    },
    error: null,
  }),
}))

import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { sessionFeedbackRouter } from './sessionFeedback'

type Doc = Record<string, unknown> & { _id: string }
const store = () => h.store!

const t = initTRPC.context<Context>().create()
function caller(
  speakerId = 'sp-ada',
  {
    orgIds,
    impersonating,
  }: { orgIds?: string[]; impersonating?: boolean } = {},
) {
  const speaker = {
    _id: speakerId,
    name: speakerId,
    ...(orgIds && { organizerOrgIds: orgIds }),
  }
  const user = { email: `${speakerId}@example.com`, name: 'x', picture: '' }
  return t.createCallerFactory(sessionFeedbackRouter)({
    req: { headers: new Headers(), url: 'http://localhost:3000' },
    session: {
      expires: '2099-01-01T00:00:00Z',
      user,
      speaker,
      ...(impersonating && { isImpersonating: true }),
    },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
}

const organizer = () => caller('sp-org1', { orgIds: ['org-A'] })

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const talk = (id: string, fields: Record<string, unknown> = {}): Doc => ({
  _id: id,
  _type: 'talk',
  _rev: `rev-${id}`,
  title: `Title of ${id}`,
  status: 'confirmed',
  conference: ref('conf-A'),
  speakers: [ref('sp-ada'), ref('sp-bo')],
  ...fields,
})
/** One slot on 2026-06-10, 10:00–10:40 Oslo (08:00–08:40Z). */
const schedule = (talkIds: string[]): Doc => ({
  _id: 'day-1',
  _type: 'schedule',
  conference: ref('conf-A'),
  status: 'official',
  date: '2026-06-10',
  tracks: [
    {
      _key: 't',
      talks: talkIds.map((id) => ({
        _key: id,
        talk: ref(id),
        startTime: '10:00',
        endTime: '10:40',
      })),
    },
  ],
})
let n = 0
const response = (
  talkId: string,
  fields: Record<string, unknown> = {},
): Doc => {
  n++
  return {
    _id: `feedbackResponse-${String(n).padStart(32, '0')}`,
    _type: 'feedbackResponse',
    _rev: `rev-r${n}`,
    talk: ref(talkId),
    conference: ref('conf-A'),
    colour: 'red',
    comment: `Secret comment ${n}`,
    submittedAt: `2026-06-10T08:${String(10 + n).padStart(2, '0')}:00.000Z`,
    ...fields,
  }
}

/** After the slot ended: feedback is visible (§6). */
const AFTER_SESSION = new Date('2026-06-10T09:00:00Z')
/** During the session: the window is open, but speakers can't see yet. */
const IN_SESSION = new Date('2026-06-10T08:20:00Z')

/** Every flag refusal, by its message: one answer for every reason. */
const REFUSED = { code: 'NOT_FOUND', message: 'Feedback Response not found' }

const notifications = () =>
  store()
    .all()
    .filter((d) => d._type === 'notification')
const doc = (id: string) => store().doc(id)

let ours: Doc
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AFTER_SESSION)
  n = 0
  h.push.mockClear()
  ours = response('talk-1')
  store().reset([
    {
      _id: 'conf-A',
      _type: 'conference',
      organization: ref('org-A'),
      // Ada speaks AND organizes: she is never told about her own flag.
      organizers: [ref('sp-org1'), ref('sp-ada'), ref('sp-org2')],
    },
    {
      _id: 'conf-B',
      _type: 'conference',
      organization: ref('org-B'),
      organizers: [ref('sp-orgB')],
    },
    talk('talk-1'),
    talk('talk-2'),
    talk('talk-foreign', { conference: ref('conf-B') }),
    talk('talk-other-speakers', { speakers: [ref('sp-bo')] }),
    talk('talk-accepted', { status: 'accepted' }),
    schedule([
      'talk-1',
      'talk-2',
      'talk-other-speakers',
      'talk-accepted',
      'talk-foreign',
    ]),
    ours,
  ])
})
afterEach(() => {
  vi.useRealTimers()
})

describe('sessionFeedback.flag (§9.3, §10.3)', () => {
  it('sets flaggedAt on a visible comment of the speaker’s talk', async () => {
    await expect(
      caller().flag({ talkId: 'talk-1', responseId: ours._id }),
    ).resolves.toEqual({ flagged: true })
    expect(doc(ours._id)).toMatchObject({
      flaggedAt: AFTER_SESSION.toISOString(),
      comment: ours.comment,
      colour: 'red',
    })
  })

  it('writes under the revision it read', async () => {
    await caller().flag({ talkId: 'talk-1', responseId: ours._id })
    const patches = store()
      .commits.flat()
      .filter((m) => 'patch' in m)
    expect(patches).toEqual([
      {
        patch: expect.objectContaining({
          id: ours._id,
          ifRevisionID: 'rev-r1',
        }),
      },
    ])
  })

  it('shows "flagged" to every speaker of the talk through results', async () => {
    await caller('sp-ada').flag({ talkId: 'talk-1', responseId: ours._id })
    const seen = await caller('sp-bo').results({ talkId: 'talk-1' })
    expect(seen.visible && seen.comments).toEqual([
      expect.objectContaining({ id: ours._id, flagged: true }),
    ])
  })

  it('an already flagged comment succeeds without writing or notifying', async () => {
    store().put({ ...ours, flaggedAt: '2026-06-10T08:50:00.000Z' })
    await expect(
      caller('sp-bo').flag({ talkId: 'talk-1', responseId: ours._id }),
    ).resolves.toEqual({ flagged: true })
    expect(store().commits).toEqual([])
    expect(doc(ours._id)!.flaggedAt).toBe('2026-06-10T08:50:00.000Z')
    expect(notifications()).toEqual([])
  })

  it('reads the response past a lagging query: a flag right after Keep is not lost', async () => {
    // GROQ still shows the flag Keep just cleared; the doc endpoint does not.
    store().readsLagFor(ours._id, {
      ...ours,
      flaggedAt: '2026-06-10T08:50:00.000Z',
    })
    await caller().flag({ talkId: 'talk-1', responseId: ours._id })
    expect(doc(ours._id)!.flaggedAt).toBe(AFTER_SESSION.toISOString())
    expect(notifications()).toHaveLength(2)
  })
})

describe('sessionFeedback.flag — one uniform refusal (§9.1)', () => {
  const refusedWithoutWrite = async (
    input: { talkId: string; responseId: string },
    as = caller(),
  ) => {
    await expect(as.flag(input)).rejects.toMatchObject(REFUSED)
    expect(store().commits).toEqual([])
    expect(notifications()).toEqual([])
  }

  it('positive control: the same request is accepted', async () => {
    await caller().flag({ talkId: 'talk-1', responseId: ours._id })
    expect(doc(ours._id)!.flaggedAt).toBeDefined()
  })

  for (const [why, fields] of [
    ['hidden', { hiddenAt: '2026-06-10T08:55:00.000Z' }],
    ['without a comment', { comment: undefined }],
    ['with a blank comment', { comment: '   ' }],
    ['of another conference', { conference: ref('conf-B') }],
    ['of another talk of the same speaker', { talk: ref('talk-2') }],
    ['not a response', { _type: 'talk' }],
  ] as const) {
    it(`refuses a response ${why}, as a missing one`, async () => {
      store().put({ ...ours, ...fields })
      await refusedWithoutWrite({ talkId: 'talk-1', responseId: ours._id })
      expect(doc(ours._id)).not.toHaveProperty('flaggedAt')
    })
  }

  it('refuses a missing response', async () => {
    await refusedWithoutWrite({
      talkId: 'talk-1',
      responseId: `feedbackResponse-${'f'.repeat(32)}`,
    })
  })

  for (const [why, talkId, as] of [
    ['of another conference', 'talk-foreign', 'sp-ada'],
    ['the caller does not speak at', 'talk-other-speakers', 'sp-ada'],
    ['not confirmed', 'talk-accepted', 'sp-ada'],
    ['that does not exist', 'talk-nope', 'sp-ada'],
  ] as const) {
    it(`refuses on a talk ${why}, before the response is read`, async () => {
      // The response is the talk's own and flaggable: only the talk refuses.
      const r = response(talkId, {
        ...(talkId === 'talk-foreign' && { conference: ref('conf-B') }),
      })
      store().put(r)
      await refusedWithoutWrite({ talkId, responseId: r._id }, caller(as))
      expect(store().docReads).toEqual([])
      expect(
        store().reads.filter((r) => r.query.includes('"feedbackResponse"')),
      ).toEqual([])
    })
  }

  it('refuses before feedback is visible (§6), before the response is read', async () => {
    vi.setSystemTime(IN_SESSION)
    await refusedWithoutWrite({ talkId: 'talk-1', responseId: ours._id })
    expect(store().docReads).toEqual([])
  })

  it('refuses an organizer impersonating a speaker, before any read', async () => {
    await refusedWithoutWrite(
      { talkId: 'talk-1', responseId: ours._id },
      caller('sp-ada', { impersonating: true }),
    )
    expect(store().reads).toEqual([])
    expect(store().docReads).toEqual([])
  })

  it('rejects a response id that is not a published response id', async () => {
    for (const responseId of [
      `drafts.${ours._id}`,
      `${ours._id},feedbackResponse-${'0'.repeat(32)}`,
      'talk-1',
    ]) {
      await expect(
        caller().flag({ talkId: 'talk-1', responseId }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    }
    expect(store().docReads).toEqual([])
  })
})

describe('sessionFeedback.flag — races (§10.3)', () => {
  it('a revision that moved (the attendee changed the answer) is read again and flagged', async () => {
    store().beforeNextCommit(() =>
      store().put({ ...ours, _rev: 'rev-resubmitted', comment: 'Changed' }),
    )
    await caller().flag({ talkId: 'talk-1', responseId: ours._id })
    expect(doc(ours._id)).toMatchObject({
      comment: 'Changed',
      flaggedAt: AFTER_SESSION.toISOString(),
    })
    expect(notifications()).toHaveLength(2)
  })

  it('another speaker’s flag landing first succeeds without a second notification', async () => {
    store().beforeNextCommit(() =>
      store().put({
        ...ours,
        _rev: 'rev-bo-flagged',
        flaggedAt: '2026-06-10T08:59:00.000Z',
      }),
    )
    await expect(
      caller().flag({ talkId: 'talk-1', responseId: ours._id }),
    ).resolves.toEqual({ flagged: true })
    expect(doc(ours._id)!.flaggedAt).toBe('2026-06-10T08:59:00.000Z')
    expect(notifications()).toEqual([])
  })

  it('an organizer’s Hide landing first refuses the flag', async () => {
    store().beforeNextCommit(() =>
      store().put({
        ...ours,
        _rev: 'rev-hidden',
        hiddenAt: '2026-06-10T08:59:00.000Z',
      }),
    )
    await expect(
      caller().flag({ talkId: 'talk-1', responseId: ours._id }),
    ).rejects.toMatchObject(REFUSED)
    expect(doc(ours._id)).not.toHaveProperty('flaggedAt')
    expect(notifications()).toEqual([])
  })

  it('a revision that moves on every attempt gives up with CONFLICT, writing nothing', async () => {
    for (let i = 0; i < 3; i++)
      store().beforeNextCommit(() =>
        store().put({ ...ours, _rev: `rev-moved-${i}` }),
      )
    await expect(
      caller().flag({ talkId: 'talk-1', responseId: ours._id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(doc(ours._id)).not.toHaveProperty('flaggedAt')
    expect(notifications()).toEqual([])
  })

  it('a response deleted before the commit is refused, not a server error', async () => {
    store().beforeNextCommit(() => store().remove(ours._id))
    await expect(
      caller().flag({ talkId: 'talk-1', responseId: ours._id }),
    ).rejects.toMatchObject(REFUSED)
    expect(notifications()).toEqual([])
  })
})

describe('sessionFeedback.flag — the organizers’ notification (§11.2)', () => {
  it('notifies each organizer of the conference but the flagger, linking to /admin/feedback', async () => {
    await caller('sp-ada').flag({ talkId: 'talk-1', responseId: ours._id })
    const sent = notifications()
    expect(
      sent.map((d) => (d.recipient as { _ref: string })._ref).sort(),
    ).toEqual(['sp-org1', 'sp-org2'])
    for (const d of sent)
      expect(d).toMatchObject({
        notificationType: 'session_feedback_flagged',
        conference: ref('conf-A'),
        link: '/admin/feedback',
        title: expect.stringContaining('Title of talk-1'),
      })
  })

  it('never carries the comment text, in the hub or the push', async () => {
    await caller().flag({ talkId: 'talk-1', responseId: ours._id })
    expect(notifications()).toHaveLength(2)
    expect(JSON.stringify(notifications())).not.toContain('Secret comment')
    expect(h.push).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(h.push.mock.calls)).not.toContain('Secret comment')
  })

  it('a speaker who is not an organizer notifies every organizer', async () => {
    await caller('sp-bo').flag({ talkId: 'talk-1', responseId: ours._id })
    expect(
      notifications()
        .map((d) => (d.recipient as { _ref: string })._ref)
        .sort(),
    ).toEqual(['sp-ada', 'sp-org1', 'sp-org2'])
  })

  it('a failed notification write does not fail the flag', async () => {
    store().afterNextCommit(() => store().failWrites())
    await expect(
      caller().flag({ talkId: 'talk-1', responseId: ours._id }),
    ).resolves.toEqual({ flagged: true })
    expect(doc(ours._id)!.flaggedAt).toBe(AFTER_SESSION.toISOString())
    expect(notifications()).toEqual([])
  })

  it('a failed organizers read does not fail the flag', async () => {
    store().failReadsThat((r) => r.query.includes('organizers'))
    await expect(
      caller().flag({ talkId: 'talk-1', responseId: ours._id }),
    ).resolves.toEqual({ flagged: true })
    expect(doc(ours._id)!.flaggedAt).toBe(AFTER_SESSION.toISOString())
    expect(notifications()).toEqual([])
  })

  it('Keep, then a new flag, notifies again: once per flag, read or not', async () => {
    await caller().flag({ talkId: 'talk-1', responseId: ours._id })
    await caller().flag({ talkId: 'talk-1', responseId: ours._id })
    expect(notifications()).toHaveLength(2)
    await organizer().adminKeep({
      responseId: ours._id,
      rev: String(doc(ours._id)!._rev),
    })
    expect(doc(ours._id)).not.toHaveProperty('flaggedAt')
    // Nobody has read the first notification: the new flag still notifies.
    expect(notifications().every((n) => !n.readAt)).toBe(true)
    await caller('sp-bo').flag({ talkId: 'talk-1', responseId: ours._id })
    expect(notifications()).toHaveLength(2 + 3)
  })

  it('each flagged comment notifies, also while an earlier one is unread (not coalesced, §11.2)', async () => {
    const second = response('talk-1')
    store().put(second)
    await caller().flag({ talkId: 'talk-1', responseId: ours._id })
    await caller().flag({ talkId: 'talk-1', responseId: second._id })
    expect(notifications()).toHaveLength(2 + 2)
  })
})

describe('sessionFeedback.adminKeep — on the revision the organizer saw (§10.3)', () => {
  const SEEN = '2026-06-10T08:50:00.000Z'
  /** The comment as the organizer's page read it: through the overview. */
  const shown = async () =>
    (await organizer().adminOverview()).sessions
      .flatMap((s) => s.comments)
      .find((c) => c.id === ours._id)!
  const keep = (rev: string, as = organizer()) =>
    as.adminKeep({ responseId: ours._id, rev })
  beforeEach(() => {
    store().put({ ...ours, flaggedAt: SEEN })
  })

  it('clears the flag on the revision the page showed; the comment stays', async () => {
    const seen = await shown()
    expect(seen).toMatchObject({ flagged: true, rev: 'rev-r1' })
    await expect(keep(seen.rev)).resolves.toEqual({ kept: true })
    expect(doc(ours._id)).not.toHaveProperty('flaggedAt')
    expect(doc(ours._id)).toMatchObject({ comment: ours.comment })
    expect(store().commits.flat()).toEqual([
      {
        patch: expect.objectContaining({
          id: ours._id,
          ifRevisionID: 'rev-r1',
        }),
      },
    ])
  })

  it('refuses to clear a flag on wording nobody read: the attendee reworded after the page loaded', async () => {
    const seen = await shown()
    expect(seen.comment).toBe('Secret comment 1')
    // Submit's patch never touches flaggedAt (§7.4).
    const { clientWrite } = await import('@/lib/sanity/client')
    await clientWrite
      .patch(ours._id)
      .set({ comment: 'NEW ABUSIVE TEXT' })
      .commit()
    await expect(keep(seen.rev)).resolves.toEqual({
      kept: false,
      now: 'flagged',
    })
    expect(doc(ours._id)).toMatchObject({
      flaggedAt: SEEN,
      comment: 'NEW ABUSIVE TEXT',
    })
    const res = await caller('sp-bo').results({ talkId: 'talk-1' })
    expect(res.visible && res.comments[0]).toMatchObject({
      comment: 'NEW ABUSIVE TEXT',
      flagged: true,
    })
  })

  it('refuses to clear a new flag with the SAME timestamp (another organizer kept, a speaker flagged again)', async () => {
    const seen = await shown()
    await keep(seen.rev, caller('sp-org2', { orgIds: ['org-A'] }))
    // The clock has not moved: the new flag carries the old one's time.
    await caller('sp-bo').flag({ talkId: 'talk-1', responseId: ours._id })
    store().put({ ...doc(ours._id)!, flaggedAt: SEEN })
    await expect(keep(seen.rev)).resolves.toEqual({
      kept: false,
      now: 'flagged',
    })
    expect(doc(ours._id)!.flaggedAt).toBe(SEEN)
  })

  it('a Hide landing first: not kept, and the answer says it is hidden now', async () => {
    const seen = await shown()
    await organizer().adminHide({ responseIds: [ours._id] })
    await expect(keep(seen.rev)).resolves.toEqual({
      kept: false,
      now: 'hidden',
    })
    expect(doc(ours._id)!.hiddenAt).toBeDefined()
  })

  it('never re-reads onto a newer revision: one write attempt, then one read of where it stands', async () => {
    const seen = await shown()
    store().beforeNextCommit(() =>
      store().put({ ...ours, _rev: 'rev-resubmitted', flaggedAt: SEEN }),
    )
    await expect(keep(seen.rev)).resolves.toEqual({
      kept: false,
      now: 'flagged',
    })
    expect(doc(ours._id)!.flaggedAt).toBe(SEEN)
    expect(store().commits).toEqual([])
    expect(store().docReads).toEqual([ours._id])
  })

  it('says where it stands from the doc endpoint, past a lagging GROQ read (r1 seen, r2 kept, r3 flagged again)', async () => {
    const seen = await shown()
    // Organizer B keeps (r2, unflagged); a speaker flags again (r3).
    await keep(seen.rev, caller('sp-org2', { orgIds: ['org-A'] }))
    const r2 = structuredClone(doc(ours._id)!)
    await caller('sp-bo').flag({ talkId: 'talk-1', responseId: ours._id })
    // GROQ still shows r2: unflagged.
    store().readsLagFor(ours._id, r2)
    await expect(keep(seen.rev)).resolves.toEqual({
      kept: false,
      now: 'flagged',
    })
    expect(doc(ours._id)!.flaggedAt).toBeDefined()
  })

  it('another organizer kept it first: not kept again, the answer says unflagged', async () => {
    const seen = await shown()
    await keep(seen.rev, caller('sp-org2', { orgIds: ['org-A'] }))
    await expect(keep(seen.rev)).resolves.toEqual({
      kept: false,
      now: 'unflagged',
    })
  })

  it('a Remove (or the device’s delete) landing after the guard: gone, not "not found"', async () => {
    const seen = await shown()
    store().beforeNextCommit(() => store().remove(ours._id))
    await expect(keep(seen.rev)).resolves.toEqual({ kept: false, now: 'gone' })
  })

  it('a failed read of where it stands answers the cautious "flagged", not a network error', async () => {
    const seen = await shown()
    await organizer().adminHide({ responseIds: [ours._id] })
    const reader = store().clients.clientReadUncached as {
      getDocument: (id: string) => Promise<unknown>
    }
    const spy = vi
      .spyOn(reader, 'getDocument')
      .mockRejectedValueOnce(new Error('socket hang up'))
    try {
      await expect(keep(seen.rev)).resolves.toEqual({
        kept: false,
        now: 'flagged',
      })
      expect(spy).toHaveBeenCalledWith(ours._id)
    } finally {
      spy.mockRestore()
    }
  })

  it('a comment emptied by its attendee since: gone', async () => {
    const seen = await shown()
    store().put({
      ...ours,
      _rev: 'rev-emptied',
      flaggedAt: SEEN,
      comment: undefined,
    })
    await expect(keep(seen.rev)).resolves.toEqual({ kept: false, now: 'gone' })
  })

  for (const [why, fields] of [
    [
      'of another conference',
      { conference: ref('conf-B'), talk: ref('talk-foreign') },
    ],
    ['whose talk is another conference’s', { talk: ref('talk-foreign') }],
  ] as const) {
    it(`refuses a response ${why} as a missing one, writing nothing`, async () => {
      store().put({ ...ours, flaggedAt: SEEN, ...fields })
      await expect(keep('rev-r1')).rejects.toMatchObject(REFUSED)
      await expect(
        organizer().adminKeep({
          responseId: `feedbackResponse-${'f'.repeat(32)}`,
          rev: 'rev-r1',
        }),
      ).rejects.toMatchObject(REFUSED)
      expect(store().commits).toEqual([])
      expect(doc(ours._id)!.flaggedAt).toBe(SEEN)
    })
  }

  it('refuses a speaker who is not an organizer, before any read', async () => {
    for (const as of [caller('sp-ada'), caller('sp-x', { orgIds: ['org-B'] })])
      await expect(keep('rev-r1', as)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    expect(store().reads).toEqual([])
    expect(store().commits).toEqual([])
  })
})
