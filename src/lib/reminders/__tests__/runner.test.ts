import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReminderConference } from '../types'

// --- Boundary mocks --------------------------------------------------------
// `createNotifications` now RESOLVES the number of documents persisted (N2). By
// default it succeeds (returns the input length); tests override per-call to
// simulate a silent failure (resolves 0) or a throw.
const createNotificationsMock = vi
  .fn()
  .mockImplementation((items: unknown) =>
    Promise.resolve(Array.isArray(items) ? items.length : 0),
  )
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: (...a: unknown[]) => createNotificationsMock(...a),
}))

// Routed fetch: the runner issues several distinct GROQ reads; dispatch by a
// signature substring of each query so one mock serves them all.
let talkRows: unknown[] = []
let travelRows: unknown[] = []
let markerRows: unknown[] = []
/**
 * Today's `schedule` DOCUMENTS. A conference keeps one per day per status — the
 * private drafts organizers are still editing plus an archived snapshot of every
 * superseded published version — so this list is not a single day. Each row's
 * `status` is what the store holds (absent = a legacy day written before drafts
 * existed).
 */
let agendaRows: { status?: string; tracks?: unknown }[] = []
const fetchMock = vi.fn((query: string) => {
  if (query.includes('scheduledReminderLog')) return Promise.resolve(markerRows)
  if (query.includes('travelSupport')) return Promise.resolve(travelRows)
  if (query.includes('hasSlides')) return Promise.resolve(talkRows)
  if (query.includes('_type == "schedule"')) {
    // Fake the store by applying the QUERY'S OWN status predicate: an agenda
    // read that fails to constrain status sees the drafts and archived
    // snapshots too, exactly as Sanity would return them.
    const officialOnly = query.includes('status == "official"')
    return Promise.resolve(
      officialOnly
        ? agendaRows.filter((row) => !row.status || row.status === 'official')
        : agendaRows,
    )
  }
  return Promise.resolve([])
})

/**
 * Write mocks. Both marker paths now go through `clientWrite.transaction()`, so
 * the ROUND-TRIP count is `commitMock.mock.calls.length` — one per stamped chunk
 * — while `txCreateIfNotExists` counts the marker MUTATIONS inside them. The two
 * together are what pins the batching: N markers must cost 1 commit, not N.
 */
const commitMock = vi.fn().mockResolvedValue({})
const txCreateIfNotExists = vi.fn()
const txPatch = vi.fn()
const patchBuilder = { set: () => patchBuilder, inc: () => patchBuilder }
function makeTx() {
  let markers = 0
  const tx = {
    createIfNotExists: (doc: unknown) => {
      markers += 1
      txCreateIfNotExists(doc)
      return tx
    },
    patch: (id: string, fn?: (p: typeof patchBuilder) => unknown) => {
      txPatch(id)
      if (typeof fn === 'function') fn(patchBuilder)
      return tx
    },
    // The commit reports how many marker mutations this transaction carried, so
    // a test can fail a BATCHED commit while letting the per-item retries pass.
    commit: () => commitMock(markers),
  }
  return tx
}
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (q: string) => fetchMock(q) },
  clientWrite: { transaction: () => makeTx() },
}))

import { runSpeakerReminders, runDayOfAgenda } from '../runner'

const CONF: ReminderConference = {
  _id: 'conf-1',
  title: 'CloudNative Days',
  startDate: '2026-09-10',
  endDate: '2026-09-11',
}

// Pre-conference date where ONLY confirm-talk is due for an accepted-talk speaker.
const PRE = new Date('2026-08-20T06:00:00Z')
const CONFIRM_ID = 'reminder.confirm-talk.conf-1.s1'

beforeEach(() => {
  vi.clearAllMocks()
  // `clearAllMocks` clears CALLS, not implementations — restore the defaults so
  // a test that installs a failing implementation cannot leak into the next one.
  createNotificationsMock.mockImplementation((items: unknown) =>
    Promise.resolve(Array.isArray(items) ? items.length : 0),
  )
  commitMock.mockResolvedValue({})
  talkRows = [
    {
      _id: 't1',
      title: 'My Talk',
      status: 'accepted',
      speakerIds: ['s1'],
      hasSlides: false,
    },
  ]
  travelRows = []
  markerRows = []
  agendaRows = []
})

describe('runSpeakerReminders — dedup + re-arming', () => {
  it('sends a due reminder on the first run and stamps a marker', async () => {
    const summary = await runSpeakerReminders(CONF, PRE)
    expect(summary.sent).toBe(1)
    expect(createNotificationsMock).toHaveBeenCalledTimes(1)
    const inputs = createNotificationsMock.mock.calls[0][0]
    expect(inputs[0].recipientId).toBe('s1')
    expect(inputs[0].link).toBe('/cfp/proposal/t1')
    // Marker stamped via transaction commit.
    expect(commitMock).toHaveBeenCalledTimes(1)
    const confirm = summary.perReminder.find((r) => r.key === 'confirm-talk')!
    expect(confirm.sent).toBe(1)
  })

  it('does not re-send inside the spacing window', async () => {
    markerRows = [
      { _id: CONFIRM_ID, count: 1, lastSentAt: '2026-08-18T06:00:00Z' }, // 2 days ago
    ]
    const summary = await runSpeakerReminders(CONF, PRE)
    expect(summary.sent).toBe(0)
    expect(summary.skipped).toBe(1)
    expect(createNotificationsMock).not.toHaveBeenCalled()
  })

  it('re-sends once the spacing has elapsed and the cap is not reached', async () => {
    markerRows = [
      { _id: CONFIRM_ID, count: 1, lastSentAt: '2026-08-08T06:00:00Z' }, // 12 days ago
    ]
    const summary = await runSpeakerReminders(CONF, PRE)
    expect(summary.sent).toBe(1)
  })

  it('does not send once the cap is reached', async () => {
    markerRows = [
      { _id: CONFIRM_ID, count: 2, lastSentAt: '2026-08-08T06:00:00Z' },
    ]
    const summary = await runSpeakerReminders(CONF, PRE)
    expect(summary.sent).toBe(0)
    expect(summary.skipped).toBe(1)
  })

  it('never throws when the emit fails; isolates and counts it', async () => {
    createNotificationsMock.mockRejectedValueOnce(new Error('boom'))
    const summary = await runSpeakerReminders(CONF, PRE)
    expect(summary.failed).toBe(1)
    expect(summary.sent).toBe(0)
  })

  it('does NOT stamp a marker when the emit silently persists nothing (N2)', async () => {
    // createNotifications never throws — a silent failure resolves 0. The runner
    // must then NOT stamp the dedup marker, so the reminder retries next run.
    createNotificationsMock.mockResolvedValueOnce(0)
    const summary = await runSpeakerReminders(CONF, PRE)
    expect(summary.sent).toBe(0)
    expect(summary.failed).toBe(1)
    // No marker transaction committed.
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('stamps exactly once on a successful emit (N2)', async () => {
    const summary = await runSpeakerReminders(CONF, PRE)
    expect(summary.sent).toBe(1)
    expect(commitMock).toHaveBeenCalledTimes(1)
  })

  it('never throws when the candidate read fails', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new Error('read fail')),
    )
    const summary = await runSpeakerReminders(CONF, PRE)
    expect(summary).toBeDefined()
    expect(summary.sent).toBe(0)
  })
})

describe('runDayOfAgenda — presenting-today selection + dedup', () => {
  const DAY = new Date('2026-09-10T06:00:00Z')
  beforeEach(() => {
    agendaRows = [
      {
        tracks: [
          {
            trackTitle: 'Track A',
            talks: [
              { startTime: '09:00', talkTitle: 'My Talk', speakerIds: ['s1'] },
            ],
          },
        ],
      },
    ]
  })

  it('notifies a speaker presenting today when no marker exists', async () => {
    const summary = await runDayOfAgenda(CONF, DAY)
    expect(summary.isScheduleDay).toBe(true)
    expect(summary.sent).toBe(1)
    const inputs = createNotificationsMock.mock.calls[0][0]
    expect(inputs[0].recipientId).toBe('s1')
    expect(inputs[0].message).toContain('09:00')
    // N3: a day-of ping is not a proposal decision — use 'system' (→
    // otherUpdates) so it survives a proposalDecisions mute.
    expect(inputs[0].notificationType).toBe('system')
    expect(txCreateIfNotExists).toHaveBeenCalledTimes(1)
    expect(commitMock).toHaveBeenCalledTimes(1)
  })

  it('does NOT stamp the day-of marker when the emit persists nothing (N2)', async () => {
    createNotificationsMock.mockResolvedValueOnce(0)
    const summary = await runDayOfAgenda(CONF, DAY)
    expect(summary.sent).toBe(0)
    expect(summary.failed).toBe(1)
    expect(txCreateIfNotExists).not.toHaveBeenCalled()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('skips a speaker already notified today (marker present)', async () => {
    markerRows = [{ _id: 'reminder.day-of.conf-1.s1.2026-09-10', count: 1 }]
    const summary = await runDayOfAgenda(CONF, DAY)
    expect(summary.sent).toBe(0)
    expect(summary.skipped).toBe(1)
    expect(createNotificationsMock).not.toHaveBeenCalled()
  })

  it('reports a non-schedule day and sends nothing', async () => {
    agendaRows = []
    const summary = await runDayOfAgenda(CONF, DAY)
    expect(summary.isScheduleDay).toBe(false)
    expect(summary.sent).toBe(0)
  })

  it('mails the OFFICIAL slot, ignoring a draft that places the talk earlier', async () => {
    // The day-of mail keeps each speaker's earliest slot. Across documents that
    // means an unpublished draft (or an archived snapshot) with an earlier time
    // would win and send the speaker to the wrong room, hours early.
    agendaRows = [
      {
        status: 'draft',
        tracks: [
          {
            trackTitle: 'Draft Track',
            talks: [
              { startTime: '07:00', talkTitle: 'My Talk', speakerIds: ['s1'] },
            ],
          },
        ],
      },
      {
        status: 'archived',
        tracks: [
          {
            trackTitle: 'Old Track',
            talks: [
              { startTime: '08:00', talkTitle: 'My Talk', speakerIds: ['s1'] },
            ],
          },
        ],
      },
      {
        status: 'official',
        tracks: [
          {
            trackTitle: 'Track A',
            talks: [
              { startTime: '09:00', talkTitle: 'My Talk', speakerIds: ['s1'] },
            ],
          },
        ],
      },
    ]

    const summary = await runDayOfAgenda(CONF, DAY)

    expect(summary.sent).toBe(1)
    const inputs = createNotificationsMock.mock.calls[0][0]
    expect(inputs).toHaveLength(1)
    expect(inputs[0].message).toContain('09:00')
    expect(inputs[0].message).toContain('Track A')
    expect(inputs[0].message).not.toContain('07:00')
  })

  it('still mails a LEGACY day that carries no status field', async () => {
    agendaRows = [
      {
        // No `status`: written before the draft feature — must not go silent.
        tracks: [
          {
            trackTitle: 'Track A',
            talks: [
              { startTime: '09:00', talkTitle: 'My Talk', speakerIds: ['s1'] },
            ],
          },
        ],
      },
    ]

    const summary = await runDayOfAgenda(CONF, DAY)

    expect(summary.isScheduleDay).toBe(true)
    expect(summary.sent).toBe(1)
  })
})

// --- BATCHING (Sanity request budget) --------------------------------------
// The runner used to issue TWO Sanity round-trips per due reminder — one
// `createNotifications([one])` and one marker write — inside the per-speaker
// loop. These pin the batched counts so a future edit cannot silently return to
// the N+1 shape: the assertions are on the NUMBER of writes, and a per-item
// implementation fails them by a factor of the chunk size.

/** N accepted talks, one speaker each: N speakers with exactly one due reminder. */
function manySpeakers(n: number) {
  talkRows = Array.from({ length: n }, (_, i) => ({
    _id: `t${i}`,
    title: 'My Talk',
    status: 'accepted',
    speakerIds: [`s${i}`],
    hasSlides: false,
  }))
}

describe('runSpeakerReminders — batched writes', () => {
  it('sends 120 due reminders in 3 hub writes and 3 marker transactions', async () => {
    manySpeakers(120)
    const summary = await runSpeakerReminders(CONF, PRE)

    expect(summary.sent).toBe(120)
    expect(summary.failed).toBe(0)
    // 120 items at a 50-item chunk → 50 + 50 + 20.
    expect(createNotificationsMock).toHaveBeenCalledTimes(3)
    expect(createNotificationsMock.mock.calls.map((c) => c[0].length)).toEqual([
      50, 50, 20,
    ])
    // One marker TRANSACTION per chunk (3 round-trips), carrying 120 markers.
    expect(commitMock).toHaveBeenCalledTimes(3)
    expect(txCreateIfNotExists).toHaveBeenCalledTimes(120)
    expect(txPatch).toHaveBeenCalledTimes(120)
    // The N+1 shape would have been 240 write round-trips; this is 6.
    expect(
      createNotificationsMock.mock.calls.length + commitMock.mock.calls.length,
    ).toBe(6)
  })

  it('stamps every marker under its deterministic id (retry-safe createIfNotExists)', async () => {
    manySpeakers(3)
    await runSpeakerReminders(CONF, PRE)
    const ids = txCreateIfNotExists.mock.calls.map(
      (call) => (call[0] as { _id: string })._id,
    )
    expect(ids).toEqual([
      'reminder.confirm-talk.conf-1.s0',
      'reminder.confirm-talk.conf-1.s1',
      'reminder.confirm-talk.conf-1.s2',
    ])
  })

  it('still honours MAX_SENDS_PER_RUN across chunks', async () => {
    manySpeakers(600)
    const summary = await runSpeakerReminders(CONF, PRE)
    expect(summary.sent).toBe(500)
    expect(summary.skipped).toBe(100)
    expect(createNotificationsMock).toHaveBeenCalledTimes(10)
    expect(commitMock).toHaveBeenCalledTimes(10)
  })

  it('isolates a poison item: a failed chunk retries ITEM BY ITEM', async () => {
    // A Sanity transaction is atomic, so one rejected item would otherwise take
    // its whole chunk down — every run, forever, since chunking is
    // deterministic. The chunk falls back to the old per-item shape instead.
    manySpeakers(3)
    createNotificationsMock.mockImplementation(
      (items: { recipientId: string }[]) => {
        if (items.length > 1) return Promise.resolve(0)
        return Promise.resolve(items[0].recipientId === 's1' ? 0 : 1)
      },
    )

    const summary = await runSpeakerReminders(CONF, PRE)

    expect(summary.sent).toBe(2)
    expect(summary.failed).toBe(1)
    // The batch attempt, then one attempt per item.
    expect(createNotificationsMock).toHaveBeenCalledTimes(4)
    // Only the two that persisted are stamped — the poison item stays unstamped
    // so it retries next run rather than being silently marked sent.
    const ids = txCreateIfNotExists.mock.calls.map(
      (call) => (call[0] as { _id: string })._id,
    )
    expect(ids).toEqual([
      'reminder.confirm-talk.conf-1.s0',
      'reminder.confirm-talk.conf-1.s2',
    ])
  })

  it('never re-emits when the marker transaction fails — it re-stamps per item', async () => {
    // The hub write has already landed for the whole chunk, so a stamp failure
    // must NOT re-run `createNotifications` (that would double-send). It falls
    // back to stamping one marker at a time.
    manySpeakers(3)
    commitMock.mockImplementation((markers: number) =>
      markers > 1
        ? Promise.reject(new Error('tx too big'))
        : Promise.resolve({}),
    )

    const summary = await runSpeakerReminders(CONF, PRE)

    expect(createNotificationsMock).toHaveBeenCalledTimes(1)
    expect(summary.sent).toBe(3)
    expect(summary.failed).toBe(0)
    // 1 failed batched commit + 3 successful per-item commits.
    expect(commitMock).toHaveBeenCalledTimes(4)
  })

  it('counts an item failed when even its per-item marker stamp fails', async () => {
    manySpeakers(2)
    commitMock.mockRejectedValue(new Error('sanity down'))
    const summary = await runSpeakerReminders(CONF, PRE)
    expect(summary.sent).toBe(0)
    expect(summary.failed).toBe(2)
    // Still no re-emit: the notifications persisted once.
    expect(createNotificationsMock).toHaveBeenCalledTimes(1)
  })
})

describe('runDayOfAgenda — batched writes', () => {
  const DAY = new Date('2026-09-10T06:00:00Z')

  function manyPresenting(n: number) {
    agendaRows = [
      {
        status: 'official',
        tracks: [
          {
            trackTitle: 'Track A',
            talks: Array.from({ length: n }, (_, i) => ({
              startTime: '09:00',
              talkTitle: 'My Talk',
              speakerIds: [`s${i}`],
            })),
          },
        ],
      },
    ]
  }

  it('notifies 120 presenting speakers in 3 hub writes and 3 marker transactions', async () => {
    manyPresenting(120)
    const summary = await runDayOfAgenda(CONF, DAY)

    expect(summary.sent).toBe(120)
    expect(createNotificationsMock).toHaveBeenCalledTimes(3)
    expect(createNotificationsMock.mock.calls.map((c) => c[0].length)).toEqual([
      50, 50, 20,
    ])
    expect(commitMock).toHaveBeenCalledTimes(3)
    expect(txCreateIfNotExists).toHaveBeenCalledTimes(120)
    // The day-of marker is a single-shot create — no counter patch.
    expect(txPatch).not.toHaveBeenCalled()
  })

  it('stamps day-of markers under their deterministic per-date ids', async () => {
    manyPresenting(2)
    await runDayOfAgenda(CONF, DAY)
    const ids = txCreateIfNotExists.mock.calls.map(
      (call) => (call[0] as { _id: string })._id,
    )
    expect(ids).toEqual([
      'reminder.day-of.conf-1.s0.2026-09-10',
      'reminder.day-of.conf-1.s1.2026-09-10',
    ])
  })

  it('isolates a poison item in the day-of path too', async () => {
    manyPresenting(3)
    createNotificationsMock.mockImplementation(
      (items: { recipientId: string }[]) => {
        if (items.length > 1) return Promise.resolve(0)
        return Promise.resolve(items[0].recipientId === 's1' ? 0 : 1)
      },
    )
    const summary = await runDayOfAgenda(CONF, DAY)
    expect(summary.sent).toBe(2)
    expect(summary.failed).toBe(1)
    expect(createNotificationsMock).toHaveBeenCalledTimes(4)
  })
})
