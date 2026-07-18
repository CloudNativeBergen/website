/**
 * @vitest-environment node
 *
 * Unit tests for the schedule SAVE data layer (src/lib/schedule/sanity.ts).
 *
 * This is the highest-stakes code in the schedule feature: it is the only place
 * a client-supplied `schedule._id` becomes a Sanity write. The tRPC test
 * (__tests__/api/trpc/schedule.test.ts) only exercises the router with this
 * module MOCKED, so the behaviours below — the security scope check, optimistic
 * concurrency, the atomic create transaction, and ghost-slot dropping — are
 * otherwise untested. Here `@/lib/sanity/client` is mocked so we assert exactly
 * what is (and is not) written for each case.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Deterministic key generation so assertions on serialized payloads don't
// depend on nanoid randomness. References keep their real (trivial) shape.
vi.mock('@/lib/sanity/helpers', () => ({
  generateKey: (prefix = 'item') => `${prefix}-key`,
  createReference: (id: string) => ({ _type: 'reference', _ref: id }),
  createReferenceWithKey: (id: string, prefix = 'ref') => ({
    _type: 'reference',
    _ref: id,
    _key: `${prefix}-key`,
  }),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: vi.fn(),
    patch: vi.fn(),
    transaction: vi.fn(),
  },
}))

import { clientWrite } from '@/lib/sanity/client'
import { saveScheduleToSanity, getValidTalkIds } from '@/lib/schedule/sanity'
import type { ConferenceSchedule } from '@/lib/conference/types'
import type { Conference } from '@/lib/conference/types'

const conference = { _id: 'conf-1', title: 'CND 2026' } as unknown as Conference

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (x: unknown) => x as any

// The real `clientWrite.fetch` is heavily overloaded; view the mock through a
// loose shape so per-test `mockResolvedValue` / `mock.calls` reads stay simple.
type LooseMock = ReturnType<typeof vi.fn>
const mockClient = clientWrite as unknown as {
  fetch: LooseMock
  patch: LooseMock
  transaction: LooseMock
}

/**
 * A chainable Sanity patch-builder mock. `patch()`, `ifRevisionId()` and
 * `set()` all return the same object so both the with-`_rev` and without-`_rev`
 * paths chain cleanly; `commit` is configurable per test.
 */
function installPatch(commit: () => Promise<unknown>) {
  const builder = {
    ifRevisionId: vi.fn((_rev?: unknown) => builder),
    set: vi.fn((_value?: unknown) => builder),
    commit: vi.fn(commit),
  }
  mockClient.patch.mockReturnValue(builder)
  return builder
}

/**
 * A chainable Sanity transaction mock. The conference-link `patch(id, fn)` call
 * receives a builder function; we invoke it against a captured patch object so
 * the append can be asserted.
 */
function installTransaction(commit: () => Promise<unknown> = async () => ({})) {
  const confPatch = {
    setIfMissing: vi.fn((_value?: unknown) => confPatch),
    append: vi.fn((_field?: unknown, _items?: unknown) => confPatch),
  }
  const tx = {
    create: vi.fn((_doc?: unknown) => tx),
    patch: vi.fn((_id: string, fn?: (p: typeof confPatch) => unknown) => {
      if (fn) fn(confPatch)
      return tx
    }),
    commit: vi.fn(commit),
  }
  mockClient.transaction.mockReturnValue(tx)
  return { tx, confPatch }
}

const track = (talks: ConferenceSchedule['tracks'][number]['talks']) => ({
  trackTitle: 'Track A',
  trackDescription: '',
  talks,
})

const updateDay = (
  overrides: Partial<ConferenceSchedule> = {},
): ConferenceSchedule => ({
  _id: 'sched-1',
  _rev: 'rev-1',
  date: '2026-06-15',
  tracks: [
    track([
      {
        talk: asAny({ _id: 'talk-1' }),
        startTime: '09:00',
        endTime: '09:30',
      },
    ]),
  ],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  // Restore the console spies so they don't stack across tests.
  vi.restoreAllMocks()
})

describe('saveScheduleToSanity — security scope check (update path)', () => {
  const REJECT = 'Schedule not found or not accessible'

  it('rejects when the target id does not exist (fetch → null) without writing', async () => {
    mockClient.fetch.mockResolvedValue(null)
    const patch = installPatch(async () => ({ _rev: 'new' }))

    const result = await saveScheduleToSanity(updateDay(), conference)

    expect(result).toEqual({ error: REJECT })
    expect(clientWrite.patch).not.toHaveBeenCalled()
    expect(patch.commit).not.toHaveBeenCalled()
  })

  it('rejects when the target document is not a schedule without writing', async () => {
    mockClient.fetch.mockResolvedValue({
      _type: 'talk',
      conferenceRef: 'conf-1',
    })
    const patch = installPatch(async () => ({ _rev: 'new' }))

    const result = await saveScheduleToSanity(updateDay(), conference)

    expect(result).toEqual({ error: REJECT })
    expect(clientWrite.patch).not.toHaveBeenCalled()
    expect(patch.commit).not.toHaveBeenCalled()
  })

  it('rejects a cross-conference target without writing', async () => {
    mockClient.fetch.mockResolvedValue({
      _type: 'schedule',
      conferenceRef: 'conf-OTHER',
    })
    const patch = installPatch(async () => ({ _rev: 'new' }))

    const result = await saveScheduleToSanity(updateDay(), conference)

    expect(result).toEqual({ error: REJECT })
    expect(clientWrite.patch).not.toHaveBeenCalled()
    expect(patch.commit).not.toHaveBeenCalled()
  })

  it('returns the SAME generic message for all three reject reasons (no existence probe)', async () => {
    const messages: (string | undefined)[] = []
    for (const target of [
      null,
      { _type: 'talk', conferenceRef: 'conf-1' },
      { _type: 'schedule', conferenceRef: 'conf-OTHER' },
    ]) {
      mockClient.fetch.mockResolvedValue(target)
      installPatch(async () => ({ _rev: 'new' }))
      const result = await saveScheduleToSanity(updateDay(), conference)
      messages.push(result.error)
    }
    expect(messages).toEqual([REJECT, REJECT, REJECT])
  })
})

describe('saveScheduleToSanity — update happy path', () => {
  beforeEach(() => {
    mockClient.fetch.mockResolvedValue({
      _type: 'schedule',
      conferenceRef: 'conf-1',
    })
  })

  it('patches a valid target with ifRevisionId + set + commit and threads the new _rev back', async () => {
    const patch = installPatch(async () => ({ _rev: 'new' }))

    const result = await saveScheduleToSanity(updateDay(), conference)

    expect(clientWrite.patch).toHaveBeenCalledWith('sched-1')
    expect(patch.ifRevisionId).toHaveBeenCalledWith('rev-1')

    const setArg = patch.set.mock.calls[0][0] as {
      date: string
      tracks: unknown[]
    }
    expect(setArg.date).toBe('2026-06-15')
    expect(Array.isArray(setArg.tracks)).toBe(true)

    expect(patch.commit).toHaveBeenCalledTimes(1)
    expect(result.error).toBeUndefined()
    expect(result.schedule?._rev).toBe('new')
    expect(result.schedule?._id).toBe('sched-1')
  })

  it('skips ifRevisionId when the schedule carries no _rev (unconditional write)', async () => {
    const patch = installPatch(async () => ({ _rev: 'new' }))

    const result = await saveScheduleToSanity(
      updateDay({ _rev: undefined }),
      conference,
    )

    expect(patch.ifRevisionId).not.toHaveBeenCalled()
    expect(patch.set).toHaveBeenCalledTimes(1)
    expect(patch.commit).toHaveBeenCalledTimes(1)
    expect(result.schedule?._rev).toBe('new')
  })
})

describe('saveScheduleToSanity — optimistic concurrency', () => {
  beforeEach(() => {
    mockClient.fetch.mockResolvedValue({
      _type: 'schedule',
      conferenceRef: 'conf-1',
    })
  })

  it('maps a 409 statusCode from commit to a distinct conflict result', async () => {
    const patch = installPatch(async () => {
      throw Object.assign(new Error('Conflict'), { statusCode: 409 })
    })

    const result = await saveScheduleToSanity(updateDay(), conference)

    expect(result.conflict).toBe(true)
    expect(result.error).toBeTruthy()
    expect(result.schedule).toBeUndefined()
    expect(patch.commit).toHaveBeenCalledTimes(1)
  })

  it('maps a revision-mismatch message from commit to a conflict result', async () => {
    installPatch(async () => {
      throw new Error('The revision id does not match (mismatch)')
    })

    const result = await saveScheduleToSanity(updateDay(), conference)

    expect(result.conflict).toBe(true)
  })

  it('a non-concurrency error is a generic error, not a conflict', async () => {
    installPatch(async () => {
      throw new Error('network down')
    })

    const result = await saveScheduleToSanity(updateDay(), conference)

    expect(result.conflict).toBeUndefined()
    expect(result.error).toBe('network down')
  })
})

describe('saveScheduleToSanity — create path (no _id)', () => {
  it('runs one atomic transaction: create schedule + append conference link, then reads back _rev', async () => {
    const { tx, confPatch } = installTransaction()
    mockClient.fetch.mockResolvedValue({ _rev: 'created-rev' })

    const newDay = updateDay({ _id: '', _rev: undefined })
    const result = await saveScheduleToSanity(newDay, conference)

    // Exactly one transaction, committed once. No standalone patch() write.
    expect(clientWrite.transaction).toHaveBeenCalledTimes(1)
    expect(tx.commit).toHaveBeenCalledTimes(1)
    expect(clientWrite.patch).not.toHaveBeenCalled()

    // The created doc is a schedule for this conference with a generated id.
    const created = tx.create.mock.calls[0][0] as {
      _id: string
      _type: string
      conference: { _ref: string }
    }
    expect(created._type).toBe('schedule')
    expect(typeof created._id).toBe('string')
    expect(created._id.length).toBeGreaterThan(0)
    expect(created.conference._ref).toBe('conf-1')

    // The conference link is appended to `schedules` as a keyed reference to the
    // SAME new id.
    expect(tx.patch).toHaveBeenCalledWith('conf-1', expect.any(Function))
    expect(confPatch.setIfMissing).toHaveBeenCalledWith({ schedules: [] })
    const appendArgs = confPatch.append.mock.calls[0]
    expect(appendArgs[0]).toBe('schedules')
    // A keyed reference (createReferenceWithKey) — array items MUST carry a
    // `_key`, so assert it, not just the `_ref`.
    expect(appendArgs[1]).toEqual([
      expect.objectContaining({
        _ref: created._id,
        _type: 'reference',
        _key: 'schedule-key',
      }),
    ])

    // The result carries the generated id and the read-back revision.
    expect(result.schedule?._id).toBe(created._id)
    expect(result.schedule?._rev).toBe('created-rev')
  })
})

describe('saveScheduleToSanity — ghost-slot drop', () => {
  beforeEach(() => {
    mockClient.fetch.mockResolvedValue({
      _type: 'schedule',
      conferenceRef: 'conf-1',
    })
  })

  it('drops a slot with neither talk nor placeholder while keeping real refs and placeholders', async () => {
    const patch = installPatch(async () => ({ _rev: 'new' }))

    const day = updateDay({
      tracks: [
        track([
          { talk: asAny({ _id: 't1' }), startTime: '09:00', endTime: '09:25' },
          // ghost slot: no talk, no placeholder — must be dropped.
          { startTime: '10:00', endTime: '10:25' } as never,
          { placeholder: 'Lunch', startTime: '12:00', endTime: '13:00' },
        ]),
      ],
    })

    await saveScheduleToSanity(day, conference)

    const setArg = patch.set.mock.calls[0][0] as {
      tracks: Array<{ talks: Array<Record<string, unknown>> }>
    }
    const talks = setArg.tracks[0].talks

    expect(talks).toHaveLength(2)
    // The real talk ref is preserved.
    expect(talks[0]).toMatchObject({
      talk: { _ref: 't1', _type: 'reference' },
      startTime: '09:00',
    })
    // The placeholder is preserved.
    expect(talks[1]).toMatchObject({ placeholder: 'Lunch', startTime: '12:00' })
    // Nothing timed at 10:00 (the ghost) survives.
    expect(talks.some((t) => t.startTime === '10:00')).toBe(false)
  })
})

describe('getValidTalkIds', () => {
  it('queries talk ids scoped to the conference and returns them as a Set', async () => {
    mockClient.fetch.mockResolvedValue(['talk-1', 'talk-2'])

    const ids = await getValidTalkIds('conf-1')

    expect(ids).toBeInstanceOf(Set)
    expect([...ids].sort()).toEqual(['talk-1', 'talk-2'])

    const [query, params] = mockClient.fetch.mock.calls[0]
    expect(query).toContain('_type == "talk"')
    expect(query).toContain('conference._ref == $conferenceId')
    expect(params).toEqual({ conferenceId: 'conf-1' })
  })

  it('returns an empty Set when the query yields nothing (null)', async () => {
    mockClient.fetch.mockResolvedValue(null)

    const ids = await getValidTalkIds('conf-1')

    expect(ids).toBeInstanceOf(Set)
    expect(ids.size).toBe(0)
  })
})
