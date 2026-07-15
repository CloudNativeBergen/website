import { beforeEach, describe, expect, it, vi } from 'vitest'

// Control the Sanity write client so we can assert on the patch/log calls the
// promotion helper makes without touching a real dataset.
type MutationResult = {
  transactionId: string
  documentIds: string[]
  results: { id: string; operation: string }[]
}

const { patch, set, commit, create } = vi.hoisted(() => {
  // Default: the conditional patch matched the record and applied the update.
  const commit = vi.fn<() => Promise<MutationResult>>(async () => ({
    transactionId: 'txn-1',
    documentIds: ['sfc-123'],
    results: [{ id: 'sfc-123', operation: 'update' }],
  }))
  const set = vi.fn<(fields: unknown) => { commit: typeof commit }>(() => ({
    commit,
  }))
  // The promotion helper selects the record with a GROQ query selection
  // (`{ query, params }`), not a bare id, so the write is gated on the *stored*
  // status.
  const patch = vi.fn<(selection: unknown) => { set: typeof set }>(() => ({
    set,
  }))
  const create = vi.fn<(doc: unknown) => Promise<{ _id: string }>>(
    async () => ({
      _id: 'activity-id',
    }),
  )
  return { patch, set, commit, create }
})

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { patch, create },
}))

import { promoteToClosedWonOnContract } from '../activity'

const SFC_ID = 'sfc-123'
const TIER = { _ref: 'tier-abc' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('promoteToClosedWonOnContract', () => {
  it.each(['prospect', 'contacted', 'negotiating'] as const)(
    'promotes a %s deal with a tier to closed-won and logs a stage change',
    async (status) => {
      const result = await promoteToClosedWonOnContract(
        SFC_ID,
        { status, tier: TIER },
        'user-1',
      )

      expect(result).toEqual({ promoted: true })

      // Pipeline status patched to closed-won on the right record, via a
      // status-gated GROQ selection (not a bare id) so the write is conditional
      // on the record still resting in an early stage.
      const selection = patch.mock.calls[0][0] as {
        query: string
        params: { id: string; earlyStages: string[] }
      }
      expect(selection.params.id).toBe(SFC_ID)
      expect(selection.query).toContain('status in $earlyStages')
      expect(selection.params.earlyStages).toEqual([
        'prospect',
        'contacted',
        'negotiating',
      ])
      expect(set).toHaveBeenCalledWith({ status: 'closed-won' })
      expect(commit).toHaveBeenCalledTimes(1)

      // A stage_change activity was recorded reflecting the move.
      expect(create).toHaveBeenCalledTimes(1)
      const activity = create.mock.calls[0][0] as {
        activityType: string
        metadata?: { oldValue?: string; newValue?: string }
      }
      expect(activity.activityType).toBe('stage_change')
      expect(activity.metadata?.oldValue).toBe(status)
      expect(activity.metadata?.newValue).toBe('closed-won')
    },
  )

  it.each(['closed-won', 'closed-lost'] as const)(
    'no-ops on a terminal %s deal without patching or re-logging',
    async (status) => {
      const result = await promoteToClosedWonOnContract(
        SFC_ID,
        { status, tier: TIER },
        'user-1',
      )

      expect(result).toEqual({ promoted: false, reason: 'not-early-stage' })
      expect(patch).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    },
  )

  it('fails closed on a missing status — skips without patching', async () => {
    const result = await promoteToClosedWonOnContract(
      SFC_ID,
      { tier: TIER },
      'user-1',
    )

    // A missing status must never default into a promotable stage.
    expect(result).toEqual({ promoted: false, reason: 'unknown-status' })
    expect(patch).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it.each([null, 'weird-legacy-value'] as const)(
    'fails closed on an unrecognised status (%o) — skips without patching',
    async (status) => {
      const result = await promoteToClosedWonOnContract(
        SFC_ID,
        { status, tier: TIER },
        'user-1',
      )

      expect(result).toEqual({ promoted: false, reason: 'unknown-status' })
      expect(patch).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    },
  )

  it('does not resurrect a closed-lost deal when the stored status changed after a stale read', async () => {
    // Caller read `negotiating`, but between that read and the write an admin
    // marked the deal closed-lost. The conditional patch matches nothing.
    commit.mockResolvedValueOnce({
      transactionId: 'txn-empty',
      documentIds: [],
      results: [],
    })

    const result = await promoteToClosedWonOnContract(
      SFC_ID,
      { status: 'negotiating', tier: TIER },
      'user-1',
    )

    expect(result).toEqual({ promoted: false, reason: 'concurrent-transition' })

    // It attempted the status-gated conditional patch...
    const selection = patch.mock.calls[0][0] as {
      query: string
      params: { id: string; earlyStages: string[] }
    }
    expect(selection.params.id).toBe(SFC_ID)
    expect(selection.query).toContain('status in $earlyStages')

    // ...but logged no phantom stage change since nothing was overwritten.
    expect(create).not.toHaveBeenCalled()
  })

  it('skips promotion and logs a note when the tier guard fails', async () => {
    const result = await promoteToClosedWonOnContract(
      SFC_ID,
      { status: 'negotiating', tier: null },
      'user-1',
    )

    expect(result).toEqual({ promoted: false, reason: 'tier-missing' })

    // Never patches the record to an invalid (tier-less) closed-won.
    expect(patch).not.toHaveBeenCalled()

    // Logs a skip note (not a stage_change) for the audit trail.
    expect(create).toHaveBeenCalledTimes(1)
    const activity = create.mock.calls[0][0] as { activityType: string }
    expect(activity.activityType).toBe('note')
  })

  it('reports an error without throwing when the patch fails', async () => {
    commit.mockRejectedValueOnce(new Error('sanity down'))

    const result = await promoteToClosedWonOnContract(
      SFC_ID,
      { status: 'prospect', tier: TIER },
      'user-1',
    )

    expect(result.promoted).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
    // Failed before it could log a stage change.
    expect(create).not.toHaveBeenCalled()
  })
})
